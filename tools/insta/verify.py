"""검증 단계. PATTERN.md 4절의 핵심: 추출은 싸고 틀리기 쉽다, 검증이 결과를 믿을 만하게 만든다.

추출된 가게 이름을 네이버 지역검색에 넣고, 돌아온 결과가 정말 그 가게인지
  1) 이름 유사도   2) 동네 일치
두 가지로 거른다. 하나라도 어긋나면 "검증 실패"다. 그럴듯한 엉뚱한 가게를 올리는 것보다 낫다.
"""

from __future__ import annotations

import re
import time
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Callable


@dataclass
class Venue:
    """추출 단계가 돌려주는 가게 하나"""
    name: str
    area: str | None = None          # 동네·역·구 (예: "성수동", "을지로")
    cuisine: str | None = None       # lib/supabaseClient.ts의 CUISINES 중 하나
    confidence: str = "low"          # "high" = 이름이 명시돼 있었음


def name_key(name: str) -> str:
    """상호 비교용 키. lib/supabaseClient.ts의 nameKey()와 반드시 같은 규칙.
    소문자 + 글자·숫자 외 전부 제거. 예: "밀도 성수점" → "밀도성수점"
    """
    s = unicodedata.normalize("NFC", name).lower()
    return re.sub(r"[\W_]+", "", s)


def similar(wanted: str, returned: str) -> bool:
    """검색 결과 이름이 찾던 이름과 같은 가게인가.
    한글 상호는 짧아서 단어 겹침 방식(PATTERN.md Guard 3)이 안 맞는다.
    대신 포함 관계("밀도" ⊂ "밀도 성수점")와 문자열 유사도를 본다.
    """
    a, b = name_key(wanted), name_key(returned)
    if len(a) < 2 or len(b) < 2:
        return False
    if a in b or b in a:
        return True
    return SequenceMatcher(None, a, b).ratio() >= 0.6


_AREA_SUFFIX = re.compile(r"(특별시|광역시|자치시|자치도|동|역|구|시|군|읍|면|리|가)$")


def area_ok(area: str | None, address: str) -> bool:
    """추출된 동네가 검색 결과 주소에 들어 있는가. 동네 정보가 없으면 통과."""
    if not area:
        return True
    addr = name_key(address)
    for token in re.split(r"\s+", area.strip()):
        core = name_key(_AREA_SUFFIX.sub("", token))
        if len(core) >= 2 and core in addr:
            return True
        # "성수동1가"처럼 뒤에 숫자가 붙는 경우를 위해 앞 두 글자만으로도 본다
        if len(core) >= 2 and core[:2] in addr:
            return True
    return False


class NaverSearch:
    """같은 검색어는 한 번만 부른다. 네이버 일일 한도 보호용으로 호출 사이에 잠깐 쉰다."""

    def __init__(self, fn: Callable[[str], list[dict[str, Any]]]) -> None:
        self._fn = fn
        self._cache: dict[str, list[dict[str, Any]]] = {}
        self.calls = 0

    def __call__(self, query: str) -> list[dict[str, Any]]:
        q = query.strip()
        if q in self._cache:
            return self._cache[q]
        self.calls += 1
        time.sleep(0.15)
        hits = self._fn(q)
        self._cache[q] = hits
        return hits


def verify_venue(search: NaverSearch, v: Venue) -> dict[str, Any] | None:
    """동네+이름으로 먼저, 안 되면 이름만으로 검색해 두 guard를 통과한 첫 결과를 돌려준다."""
    queries = []
    if v.area:
        queries.append(f"{v.area} {v.name}")
    queries.append(v.name)
    for q in queries:
        for hit in search(q):
            addr = hit.get("address") or hit.get("jibunAddress") or ""
            if similar(v.name, hit.get("name", "")) and area_ok(v.area, addr):
                return hit
    return None
