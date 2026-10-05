"""인스타 저장 컬렉션 → 맛집 후보 파이프라인.

tools/insta 폴더에서 실행한다.

  python run.py                 다운로드 → 처리 (평소 쓰는 명령)
  python run.py download        인스타에서 새 포스트만 받기
  python run.py process         받아둔 포스트 처리 (OCR → 추출 → 검증 → 후보 올리기)

옵션 (process에만)
  --retry-failed    검증에 실패했던 포스트를 다시 시도
  --retry-no-venue  "맛집 없음"으로 끝난 포스트를 다시 시도 (사진 전부 읽기)
  --retry-many-photos  사진 4장 이상인 포스트를 결과와 무관하게 다시 처리
                    (규칙 변경 전에 처리된 포스트에 새 규칙을 적용할 때)
  --no-llm          Claude 없이 규칙만으로 추출
  --dry-run         DB에 쓰지 않고 결과만 보여주기
  --limit N         앞에서 N개 포스트만
  --ocr-images N    2단계에서 포스트당 OCR할 최대 사진 수 (기본 10, 0이면 OCR 생략)

추출은 두 단계다.
  1단계  캡션 + 첫 사진 글씨 → Claude. 대부분 여기서 끝난다.
  2단계  1단계에서 아무것도 못 찾았거나 사진이 4장 이상이면 사진을 전부 읽고 다시 묻는다.
         결과는 1단계와 합친다. 여기서도 없으면 "맛집 없음"으로 기록한다.
흐름은 PATTERN.md를 따른다: download → read(OCR) → extract → VALIDATE → act.
처리한 포스트는 Supabase insta_posts에 기록되어 다시 보지 않는다.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from config import ARCHIVE, COOKIES, GDL_CONF, POSTS_DIR, Settings
from extract import Ocr, extract_llm, extract_rules, find_claude
from store import Store
from verify import NaverSearch, Venue, name_key, verify_venue

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MANY_PHOTOS = 4   # 이 장수 이상이면 캡션에서 가게를 찾았어도 사진을 전부 읽는다


@dataclass
class Post:
    shortcode: str
    post_url: str
    username: str | None
    posted_at: str | None
    caption: str
    images: list[Path] = field(default_factory=list)
    location: str | None = None       # 인스타 위치 태그 이름 (있을 때만)
    ocr_headline: str | None = None
    ocr_text: str | None = None


# ---- 1. 다운로드 ----------------------------------------------------------

def gallery_dl_cmd() -> list[str]:
    exe = shutil.which("gallery-dl")
    return [exe] if exe else [sys.executable, "-m", "gallery_dl"]


def _count_files(root: Path) -> int:
    return sum(1 for p in root.rglob("*") if p.is_file()) if root.exists() else 0


def download(settings: Settings) -> None:
    settings.require_download()
    POSTS_DIR.mkdir(exist_ok=True)
    for url in settings.collection_urls:
        print(f"다운로드: {url}")
        cmd = gallery_dl_cmd() + [
            "--config", str(GDL_CONF),
            "--destination", str(POSTS_DIR),
            "--cookies", str(COOKIES),
            "--download-archive", str(ARCHIVE),
            url,
        ]
        before = _count_files(POSTS_DIR)
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        out = proc.stdout + proc.stderr
        new = _count_files(POSTS_DIR) - before   # 이미 받은 건 archive 덕에 건너뛰므로 새 것만 늘어난다
        blob = out.lower()
        if "checkpoint" in blob or ("login" in blob and ("redirect" in blob or "required" in blob)):
            raise SystemExit("인스타 세션이 만료됐거나 로그인 확인이 필요합니다. cookies.txt를 다시 내보내세요.")
        if proc.returncode != 0 and new == 0:
            print(out[-1500:])
            raise SystemExit(f"gallery-dl 실패 (exit {proc.returncode})")
        print(f"  새 파일 {new}개")


# ---- 2. 받아둔 포스트 읽기 --------------------------------------------------

def _first_sidecar(folder: Path) -> dict[str, Any] | None:
    sidecars = sorted(folder.glob("*.json"))
    if not sidecars:
        return None
    try:
        return json.loads(sidecars[0].read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def scan_posts() -> list[Post]:
    if not POSTS_DIR.exists():
        return []
    posts: list[Post] = []
    for folder in sorted(POSTS_DIR.iterdir()):
        if not folder.is_dir():
            continue
        meta = _first_sidecar(folder)
        if not meta:
            continue
        shortcode = str(meta.get("post_shortcode") or folder.name)
        loc = meta.get("location")
        if isinstance(loc, dict):
            loc = loc.get("name")
        posts.append(Post(
            shortcode=shortcode,
            post_url=str(meta.get("post_url") or f"https://www.instagram.com/p/{shortcode}/"),
            username=meta.get("username"),
            posted_at=str(meta.get("post_date") or meta.get("date") or "") or None,
            caption=str(meta.get("description") or ""),
            # 영상(.mp4)은 OCR 대상이 아니다. 사진이 하나도 없는 포스트도 정상이다(캡션만 본다).
            images=sorted(p for p in folder.iterdir() if p.suffix.lower() in IMG_EXT),
            location=str(loc) if loc else None,
        ))
    return posts


# ---- 3~5. 처리 ------------------------------------------------------------

def _snippet(caption: str) -> str | None:
    s = " ".join(caption.split())
    return (s[:80] + ("…" if len(s) > 80 else "")) or None


def _source(p: Post) -> dict[str, Any]:
    return {
        "shortcode": p.shortcode,
        "post_url": p.post_url,
        "username": p.username,
        "posted_at": p.posted_at,
        "snippet": _snippet(p.caption),
    }


def process(settings: Settings, args: argparse.Namespace) -> None:
    store = Store(settings)
    processed = store.processed()
    registered = {name_key(n) for n in store.registered_names()}
    pending = store.pending_by_key()

    posts = scan_posts()
    retry = set()
    if args.retry_failed:
        retry.add("failed")
    if args.retry_no_venue:
        retry.add("no_venue")
    todo = [p for p in posts
            if p.shortcode not in processed or processed[p.shortcode] in retry
            or (args.retry_many_photos and len(p.images) >= MANY_PHOTOS)]
    if args.limit:
        todo = todo[:args.limit]
    print(f"포스트 {len(posts)}개 중 처리할 것 {len(todo)}개 "
          f"(기등록 맛집 {len(registered)}, 대기중 후보 {len(pending)})")
    if not todo:
        return

    exe = None if args.no_llm else find_claude(settings.claude_exe)
    if not args.no_llm and not exe:
        print("  [안내] claude 실행 파일을 찾지 못해 규칙 방식으로 추출합니다 (README 참고).")

    def extract(batch: list[Post]) -> dict[str, list[Venue]]:
        if not batch:
            return {}
        return (extract_llm(batch, exe, settings.claude_model) if exe
                else {p.shortcode: extract_rules(p) for p in batch})

    ocr = Ocr() if args.ocr_images > 0 else None
    if ocr and not ocr.enabled:
        ocr = None

    # 1단계: 캡션 + 첫 사진. 대부분의 포스트는 여기서 끝난다.
    if ocr:
        for i, p in enumerate(todo, 1):
            p.ocr_headline, p.ocr_text = ocr.read(p.images[:1])
            if i % 10 == 0 or i == len(todo):
                print(f"  1단계 OCR {i}/{len(todo)}")
    extracted: dict[str, list[Venue]] = extract(todo)

    # 2단계: 사진을 전부 읽고 다시 묻는다. 대상은
    #   - 1단계에서 아무것도 못 찾았고 사진이 더 있는 포스트
    #   - 사진이 4장 이상인 포스트 (캡션에 가게 하나만 적고 사진에 열 곳을 담는 모음 글 대비)
    # 1단계 결과와 합친다(이름 기준 중복 제거). 여기서도 없으면 정말 없는 것.
    if ocr:
        second = [p for p in todo
                  if (not extracted.get(p.shortcode) and len(p.images) > 1)
                  or len(p.images) >= MANY_PHOTOS]
        for i, p in enumerate(second, 1):
            p.ocr_headline, p.ocr_text = ocr.read(p.images[:args.ocr_images])
            if i % 5 == 0 or i == len(second):
                print(f"  2단계 OCR {i}/{len(second)} (사진 전부)")
        for code, venues in extract(second).items():
            seen = {name_key(v.name) for v in extracted.get(code, [])}
            extracted[code] = extracted.get(code, []) + [v for v in venues if name_key(v.name) not in seen]

    # 검증 → 저장
    search = NaverSearch(store.search_place)
    counts = {"candidate": 0, "already": 0, "no_venue": 0, "failed": 0}
    new_names: list[str] = []

    for p in todo:
        venues = extracted.get(p.shortcode, [])
        made = already = failed = 0

        for v in venues:
            try:
                hit = verify_venue(search, v)
            except RuntimeError as e:
                raise SystemExit(f"네이버 검색 실패: {e}") from e

            # 검증 실패여도 이름이 명시돼 있던 것은 사람이 보게 올린다 ("네이버 미확인" 표시)
            if not hit and v.confidence != "high":
                failed += 1
                continue

            name = hit["name"] if hit else v.name
            key = name_key(name)
            if key in registered:
                already += 1
                continue

            src = _source(p)
            if key in pending:
                if not args.dry_run:
                    store.add_source(pending[key], src)
                made += 1
                continue

            row = {
                "name": name,
                "name_key": key,
                "address": (hit.get("address") or hit.get("jibunAddress") or None) if hit else None,
                "lat": hit.get("lat") if hit else None,
                "lng": hit.get("lng") if hit else None,
                "category_raw": (hit.get("category") or None) if hit else None,
                "cuisine_hint": v.cuisine,
                "telephone": (hit.get("telephone") or None) if hit else None,
                "verified": bool(hit),
                "sources": [src],
            }
            if args.dry_run:
                pending[key] = {"id": "(dry)", "sources": [src]}
            else:
                cid = store.insert_candidate(row)
                pending[key] = {"id": cid, "sources": [src]}
            made += 1
            new_names.append(name + ("" if hit else " (미확인)"))

        result = ("candidate" if made else
                  "failed" if failed else
                  "already" if already else
                  "no_venue")
        counts[result] += 1
        if not args.dry_run:
            store.mark_post({
                "shortcode": p.shortcode,
                "post_url": p.post_url,
                "username": p.username,
                "posted_at": p.posted_at,
                "caption": p.caption[:2000] or None,
                "result": result,
            })

    print()
    print(f"결과: 후보 생성 {counts['candidate']} · 기등록 {counts['already']} · "
          f"맛집 없음 {counts['no_venue']} · 검증 실패 {counts['failed']}  (네이버 검색 {search.calls}회)")
    if new_names:
        print("새 후보:")
        for n in new_names:
            print(f"  - {n}")
    if args.dry_run:
        print("(--dry-run: DB에는 아무것도 쓰지 않았습니다)")
    elif counts["candidate"]:
        print("앱에서 로그인 → [후보] 버튼에서 확인하세요.")


# ---- CLI -----------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", nargs="?", default="all", choices=["all", "download", "process"])
    ap.add_argument("--retry-failed", action="store_true")
    ap.add_argument("--retry-no-venue", action="store_true")
    ap.add_argument("--retry-many-photos", action="store_true")
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ocr-images", type=int, default=10)
    args = ap.parse_args()

    settings = Settings()
    if args.command in ("all", "download"):
        download(settings)
    if args.command in ("all", "process"):
        process(settings, args)


if __name__ == "__main__":
    main()
