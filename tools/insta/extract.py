"""추출 단계: 포스트(캡션 + 사진 글씨) → 가게 후보 목록.

두 가지 방식.
  1. Claude (기본): 캡션과 OCR 텍스트를 Claude Code 헤드리스(`claude -p`)에 넘겨
     JSON으로 받는다. 구독에 포함된 기능이라 별도 API 키·요금이 없다.
  2. 규칙 (--no-llm 또는 claude가 없을 때): 따옴표·📍·첫 줄·OCR 큰 글씨를 후보로 삼는다.
     한글 캡션이 복잡하면 많이 놓친다. 검증 단계가 엉뚱한 것은 걸러준다.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING, Any

from config import PROMPT
from verify import Venue

if TYPE_CHECKING:
    from run import Post


# ---- OCR ---------------------------------------------------------------

# 사진 속 큰 글씨 중 상호가 아닌 것들 (PATTERN.md Guard 1을 인스타에 맞게 늘림)
OCR_NOISE = re.compile(
    r"www\.|https?:|@|#|\.com|\.kr|instagram|insta|릴스|reels"
    r"|팔로우|follow|좋아요|like|저장|share|공유|광고|협찬|예약|open|close"
    r"|swipe|더보기|link\s*in\s*bio|배민|요기요|쿠팡이츠|캐치테이블",
    re.I,
)


class Ocr:
    """RapidOCR 래퍼. 설치돼 있지 않으면 조용히 비활성화된다."""

    def __init__(self) -> None:
        try:
            from rapidocr_onnxruntime import RapidOCR  # type: ignore
            self._ocr = RapidOCR()
            self.enabled = True
        except Exception as e:  # noqa: BLE001
            print(f"  [OCR 비활성] rapidocr-onnxruntime을 불러올 수 없음: {e}")
            self._ocr = None
            self.enabled = False

    def read(self, images: list[Path]) -> tuple[str | None, str | None]:
        """(큰 글씨 한 줄, 전체 텍스트). 사진이 없거나 OCR이 꺼져 있으면 (None, None)."""
        if not self.enabled or not images:
            return None, None
        boxes: list[Any] = []
        for img in images:
            try:
                result, _ = self._ocr(str(img))
            except Exception as e:  # noqa: BLE001
                print(f"  [OCR 실패] {img.name}: {e}")
                continue
            boxes.extend(result or [])
        if not boxes:
            return None, None
        text = " ".join(b[1] for b in boxes)[:1500]
        return headline(boxes), text


def _box_height(b: Any) -> float:
    ys = [p[1] for p in b[0]]
    return max(ys) - min(ys)


def headline(boxes: list[Any]) -> str | None:
    """가장 큰 글씨 = 사진이 말하는 것. 줄바꿈된 제목은 비슷한 크기 상자들을 합친다."""
    usable = [b for b in boxes if len(b[1].strip()) >= 2 and not OCR_NOISE.search(b[1])]
    if not usable:
        return None
    tallest = max(_box_height(b) for b in usable)
    lines = [b[1].strip() for b in usable if _box_height(b) >= tallest * 0.85]
    text = " ".join(lines).strip()
    return text[:60] if len(text) >= 2 else None


# ---- Claude 헤드리스 ----------------------------------------------------

_INSTRUCTION = "입력에 적힌 지시를 그대로 따르세요. 설명 없이 JSON만 출력하세요."


def find_claude(configured: str) -> str | None:
    """claude 실행 파일을 찾는다: 설정값 > PATH > 데스크톱 앱에 딸려온 것(최신 버전)."""
    if configured:
        return configured if Path(configured).exists() else None
    for name in ("claude", "claude.cmd", "claude.exe"):
        found = shutil.which(name)
        if found:
            return found
    appdata = os.environ.get("APPDATA")
    if appdata:
        bundled = sorted(
            Path(appdata, "Claude", "claude-code").glob("*/claude.exe"),
            key=lambda p: [int(x) if x.isdigit() else 0 for x in p.parent.name.split(".")],
        )
        if bundled:
            return str(bundled[-1])
    return None


def _call_claude(exe: str, text: str, model: str) -> str:
    cmd = [exe, "-p", _INSTRUCTION, "--output-format", "json"]
    if model:
        cmd += ["--model", model]
    proc = subprocess.run(cmd, input=text, capture_output=True, text=True, encoding="utf-8", timeout=900)
    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError(f"claude 실행 실패 (exit {proc.returncode}): {proc.stderr.strip()[:300]}")
    try:
        envelope = json.loads(proc.stdout)
    except ValueError as e:
        raise RuntimeError(f"claude 출력이 JSON이 아닙니다: {proc.stdout[:200]}") from e
    if envelope.get("is_error"):
        msg = str(envelope.get("result", ""))
        if "login" in msg.lower():
            msg += "\n  → 터미널에서 claude를 한 번 실행해 /login 하세요 (README 참고)."
        raise RuntimeError(f"claude 오류: {msg}")
    return str(envelope.get("result", ""))


def _parse_json_array(text: str) -> list[dict[str, Any]]:
    """코드펜스·설명이 섞여 와도 첫 '['부터 마지막 ']'까지를 JSON으로 읽는다."""
    text = re.sub(r"```(?:json)?", "", text)
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end <= start:
        raise ValueError("JSON 배열을 찾지 못함")
    data = json.loads(text[start:end + 1])
    if not isinstance(data, list):
        raise ValueError("배열이 아님")
    return data


def _to_venues(items: Any) -> list[Venue]:
    out: list[Venue] = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        name = str(it.get("name") or "").strip()
        if len(name) < 2:
            continue
        out.append(Venue(
            name=name[:60],
            area=(str(it.get("area")).strip() or None) if it.get("area") else None,
            cuisine=(str(it.get("cuisine")).strip() or None) if it.get("cuisine") else None,
            confidence="high" if it.get("confidence") == "high" else "low",
        ))
    return out[:10]


def extract_llm(posts: list["Post"], exe: str, model: str, batch: int = 15) -> dict[str, list[Venue]]:
    """포스트를 묶어 Claude에 보내고 {shortcode: [Venue]}로 돌려준다.
    한 묶음이 실패하면 한 번 더 시도하고, 그래도 안 되면 그 묶음만 규칙 방식으로 대신한다.
    """
    prompt = PROMPT.read_text(encoding="utf-8")
    result: dict[str, list[Venue]] = {}
    for i in range(0, len(posts), batch):
        chunk = posts[i:i + batch]
        payload = [{
            "shortcode": p.shortcode,
            "caption": (p.caption or "")[:1500],
            "ocr_headline": p.ocr_headline,
            "ocr_text": (p.ocr_text or "")[:600] or None,
        } for p in chunk]
        text = prompt + "\n\n입력:\n" + json.dumps(payload, ensure_ascii=False)

        parsed: list[dict[str, Any]] | None = None
        for attempt in (1, 2):
            try:
                parsed = _parse_json_array(_call_claude(exe, text, model))
                break
            except (RuntimeError, ValueError) as e:
                print(f"  [Claude {attempt}회차 실패] {e}")
        if parsed is None:
            print(f"  [대체] {len(chunk)}건은 규칙 방식으로 추출")
            for p in chunk:
                result[p.shortcode] = extract_rules(p)
            continue

        by_code = {str(r.get("shortcode")): r for r in parsed if isinstance(r, dict)}
        for p in chunk:
            result[p.shortcode] = _to_venues(by_code.get(p.shortcode, {}).get("venues"))
        print(f"  Claude 추출 {i + len(chunk)}/{len(posts)}")
    return result


# ---- 규칙 방식 -----------------------------------------------------------

_QUOTED = re.compile(r"[「『\[【\"“'‘]([^」』\]】\"”'’\n]{2,30})[」』\]】\"”'’]")
_LABELED = re.compile(r"(?:📍|위치|가게|상호|매장|식당|카페)\s*[:：]?\s*([^\n#@|]{2,30})")
_AREA_TAG = re.compile(r"#([가-힣A-Za-z]{2,8}?)(?:맛집|카페|술집|밥집|디저트)")
_CLEAN = re.compile(r"[#@\U0001F300-\U0001FAFF☀-➿]+")


def _clean(s: str) -> str:
    return _CLEAN.sub(" ", s).strip(" -–—·|:：,.")


def extract_rules(post: "Post") -> list[Venue]:
    """캡션에서 가게 이름 같은 조각들을 모은다. 검증 단계가 엉뚱한 것을 걸러준다."""
    cap = post.caption or ""
    names: list[str] = []
    names += _QUOTED.findall(cap)
    names += _LABELED.findall(cap)
    first = cap.strip().split("\n", 1)[0] if cap.strip() else ""
    if first and not first.lstrip().startswith(("#", "@")):
        names.append(first)
    if post.ocr_headline:
        names.append(post.ocr_headline)

    m = _AREA_TAG.search(cap)
    area = m.group(1) if m else post.location

    seen: set[str] = set()
    out: list[Venue] = []
    for n in names:
        n = _clean(n)
        if len(n) < 2 or len(n) > 40 or n in seen:
            continue
        seen.add(n)
        out.append(Venue(name=n, area=area, confidence="low"))
    return out[:4]
