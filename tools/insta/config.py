"""경로와 설정. 모든 모듈이 여기서 읽는다.

설정 우선순위: 실제 환경변수 > tools/insta/.env > 프로젝트 루트 .env.local
Supabase 주소와 anon 키는 앱이 쓰는 .env.local 값을 그대로 가져다 쓴다.
"""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # 프로젝트 루트

POSTS_DIR = HERE / "posts"            # gallery-dl이 받은 포스트 (shortcode별 폴더)
COOKIES = HERE / "cookies.txt"        # 인스타 로그인 세션 (절대 커밋 금지)
ARCHIVE = HERE / "archive.sqlite3"    # gallery-dl이 이미 받은 것 기록
GDL_CONF = HERE / "gallery-dl.conf"
PROMPT = HERE / "prompt.md"

# 이 키들만 환경변수에서 읽는다
KEYS = (
    "SUPABASE_URL", "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "MATJIP_LOGIN", "MATJIP_PASSWORD",
    "INSTA_COLLECTION_URLS",
    "CLAUDE_EXE", "CLAUDE_MODEL",
)


def _read_env_file(path: Path) -> dict[str, str]:
    """KEY=VALUE 파일을 읽는다. 주석·빈 줄·따옴표는 무시. python-dotenv 없이 처리."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


class Settings:
    def __init__(self) -> None:
        raw: dict[str, str] = {}
        raw.update(_read_env_file(ROOT / ".env.local"))
        raw.update(_read_env_file(HERE / ".env"))
        raw.update({k: v for k, v in os.environ.items() if k in KEYS})

        self.supabase_url = raw.get("SUPABASE_URL") or raw.get("NEXT_PUBLIC_SUPABASE_URL") or ""
        self.supabase_anon_key = raw.get("SUPABASE_ANON_KEY") or raw.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""
        self.login = raw.get("MATJIP_LOGIN", "")
        self.password = raw.get("MATJIP_PASSWORD", "")
        self.collection_urls = [u.strip() for u in raw.get("INSTA_COLLECTION_URLS", "").split(",") if u.strip()]
        self.claude_exe = raw.get("CLAUDE_EXE", "")
        self.claude_model = raw.get("CLAUDE_MODEL", "")

    def require_supabase(self) -> None:
        missing = []
        if not self.supabase_url or "xxxxx" in self.supabase_url:
            missing.append("NEXT_PUBLIC_SUPABASE_URL (.env.local)")
        if not self.supabase_anon_key or self.supabase_anon_key == "xxxxx":
            missing.append("NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local)")
        if not self.login:
            missing.append("MATJIP_LOGIN (tools/insta/.env)")
        if not self.password:
            missing.append("MATJIP_PASSWORD (tools/insta/.env)")
        if missing:
            raise SystemExit("설정이 비어 있습니다:\n  - " + "\n  - ".join(missing)
                             + "\n.env.example을 .env로 복사해 채워 주세요.")

    def require_download(self) -> None:
        if not self.collection_urls:
            raise SystemExit("INSTA_COLLECTION_URLS가 비어 있습니다 (tools/insta/.env).")
        if not COOKIES.exists():
            raise SystemExit(f"{COOKIES.name}이 없습니다. README의 '인스타 로그인 쿠키' 항목을 보세요.")
        first = COOKIES.read_text(encoding="utf-8", errors="ignore")
        if not first.startswith("# Netscape HTTP Cookie File"):
            raise SystemExit("cookies.txt가 Netscape 형식이 아닙니다. 확장 프로그램에서 Netscape로 내보내세요.")
        if "sessionid" not in first:
            raise SystemExit("cookies.txt에 sessionid가 없습니다. 인스타에 로그인한 상태에서 다시 내보내세요.")
