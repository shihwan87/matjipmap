"""Supabase 읽기·쓰기.

앱과 같은 계정(편집자 이상)으로 로그인해서 쓴다. 그래서 RLS가 그대로 적용되고,
서비스 키를 PC에 둘 필요가 없다. 네이버 검색도 같은 토큰으로 search-place 함수를 부른다.
"""

from __future__ import annotations

import unicodedata
from typing import Any

import requests
from supabase import create_client

from config import Settings

ACCOUNT_DOMAIN = "shihwan87.github.io"


def username_to_email(name: str) -> str:
    """이름 계정 → 내부 이메일. lib/supabaseClient.ts의 usernameToEmail()과 같은 규칙."""
    normalized = unicodedata.normalize("NFC", name.strip()).lower()
    return f"u-{normalized.encode('utf-8').hex()}@{ACCOUNT_DOMAIN}"


class Store:
    def __init__(self, settings: Settings) -> None:
        settings.require_supabase()
        self.url = settings.supabase_url.rstrip("/")
        self.anon_key = settings.supabase_anon_key
        self.sb = create_client(self.url, self.anon_key)

        # 로그인 입력란과 같은 규칙: @가 없으면 이름 계정
        email = settings.login if "@" in settings.login else username_to_email(settings.login)
        try:
            res = self.sb.auth.sign_in_with_password({"email": email, "password": settings.password})
        except Exception as e:  # noqa: BLE001
            raise SystemExit(f"Supabase 로그인 실패: {e}\n  MATJIP_LOGIN / MATJIP_PASSWORD를 확인하세요.") from e
        self.token = res.session.access_token
        self.user_id = res.user.id

        role = self._my_role()
        if role not in ("admin", "editor"):
            raise SystemExit(f"이 계정은 '{role}' 권한이라 후보를 올릴 수 없습니다. 편집자 이상이어야 합니다.")

    def _my_role(self) -> str:
        data = self.sb.table("profiles").select("role").eq("id", self.user_id).execute().data
        return data[0]["role"] if data else "anon"

    # ---- 읽기 ---------------------------------------------------------

    def processed(self) -> dict[str, str]:
        """이미 처리한 포스트 {shortcode: result}"""
        rows = self.sb.table("insta_posts").select("shortcode,result").range(0, 9999).execute().data
        return {r["shortcode"]: r["result"] for r in rows}

    def registered_names(self) -> list[str]:
        rows = self.sb.table("entries").select("name").range(0, 9999).execute().data
        return [r["name"] for r in rows]

    def pending_by_key(self) -> dict[str, dict[str, Any]]:
        """대기중 후보 {name_key: {id, sources}}"""
        rows = (
            self.sb.table("candidates")
            .select("id,name_key,sources")
            .eq("status", "pending")
            .range(0, 9999)
            .execute()
            .data
        )
        return {r["name_key"]: r for r in rows}

    # ---- 쓰기 ---------------------------------------------------------

    def insert_candidate(self, row: dict[str, Any]) -> str:
        data = self.sb.table("candidates").insert(row).execute().data
        return data[0]["id"]

    def add_source(self, candidate: dict[str, Any], source: dict[str, Any]) -> None:
        """대기중 후보에 출처 포스트를 하나 더 붙인다 (같은 포스트면 건너뜀)."""
        sources = list(candidate.get("sources") or [])
        if any(s.get("shortcode") == source["shortcode"] for s in sources):
            return
        sources.append(source)
        self.sb.table("candidates").update({"sources": sources}).eq("id", candidate["id"]).execute()
        candidate["sources"] = sources

    def mark_post(self, row: dict[str, Any]) -> None:
        self.sb.table("insta_posts").upsert(row).execute()

    # ---- 네이버 지역검색 (search-place 함수 중계) -----------------------

    def search_place(self, query: str) -> list[dict[str, Any]]:
        r = requests.post(
            f"{self.url}/functions/v1/search-place",
            headers={
                "Authorization": f"Bearer {self.token}",
                "apikey": self.anon_key,
                "Content-Type": "application/json",
            },
            json={"query": query},
            timeout=20,
        )
        try:
            data = r.json()
        except ValueError as e:
            raise RuntimeError(f"search-place 응답을 읽을 수 없습니다 (HTTP {r.status_code})") from e
        if "error" in data:
            raise RuntimeError(f"search-place: {data['error']}")
        return data.get("places", [])
