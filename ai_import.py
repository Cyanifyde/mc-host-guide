from __future__ import annotations

import json
import os
import re
import base64
from dataclasses import dataclass
from datetime import date
from html import unescape
from html.parser import HTMLParser
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse
from urllib.request import Request, urlopen

from host_store import (
    CATEGORY_OPTIONS,
    DEFAULT_HOST,
    HOSTING_TYPE_LABELS,
    HOSTING_TYPE_OPTIONS,
    HOST_TAG_OPTIONS,
    STATUS_OPTIONS,
    TIER_OPTIONS,
    normalize_host,
    normalize_list,
)

DEFAULT_IMPORT_MODEL = os.environ.get("OLLAMA_IMPORT_MODEL", "qwen3.5:cloud")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
USER_AGENT = "MC Host Guide CMS importer/1.0"
MAX_FETCH_BYTES = 1_600_000
MAX_PAGE_TEXT = 35_000
MAX_CONTEXT_TEXT = 120_000

TEXT_FIELDS = [
    "name",
    "website_url",
    "plan_url",
    "logo_url",
    "summary",
    "cpu_model",
    "cpu_vendor",
    "advertised_clock_ghz",
    "boost_clock_ghz",
    "max_memory_gb",
    "memory_speed_mhz",
    "benchmark_score",
    "benchmark_notes",
    "cpu_notes",
    "ram_notes",
    "storage_type",
    "panel",
    "ddos_protection",
    "modpack_support",
    "support_notes",
    "price_notes",
    "last_verified",
    "status",
    "trust_notes",
    "recommendation_tier",
    "caveats",
]

LIST_FIELDS = [
    "category_picks",
    "hosting_types",
    "tags",
    "location_tags",
    "locations",
    "support_channels",
    "server_types",
    "source_urls",
    "pros",
    "cons",
]

PLAN_TEXT_FIELDS = [
    "name",
    "price_monthly_usd",
    "ram_gb",
    "cpu_cores",
    "cpu_allocation",
    "cpu_model",
    "cpu_vendor",
    "advertised_clock_ghz",
    "boost_clock_ghz",
    "memory_speed_mhz",
    "benchmark_score",
    "storage_type",
    "panel",
    "ddos_protection",
    "modpack_support",
    "support_notes",
    "price_notes",
    "player_slots",
    "recommended_players",
    "storage_gb",
    "plan_url",
    "notes",
]

PLAN_LIST_FIELDS = ["location_tags", "support_channels", "server_types"]


@dataclass
class WebPage:
    url: str
    title: str
    text: str
    links: list[tuple[str, str]]


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._title_depth = 0
        self._active_link: str | None = None
        self._active_link_text: list[str] = []
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {key.lower(): value or "" for key, value in attrs}
        if tag in {"script", "style", "noscript", "svg", "canvas"}:
            self._skip_depth += 1
        if tag == "title":
            self._title_depth += 1
        if tag == "meta":
            name = (attrs_dict.get("name") or attrs_dict.get("property") or "").lower()
            if name in {"description", "og:description", "twitter:description"}:
                self.text_parts.append(attrs_dict.get("content", ""))
        if tag == "a" and attrs_dict.get("href"):
            self._active_link = attrs_dict["href"]
            self._active_link_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg", "canvas"} and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title" and self._title_depth:
            self._title_depth -= 1
        if tag == "a" and self._active_link:
            label = clean_text(" ".join(self._active_link_text))
            self.links.append((self._active_link, label))
            self._active_link = None
            self._active_link_text = []
        if tag in {"p", "li", "tr", "div", "section", "article", "br", "h1", "h2", "h3"}:
            self.text_parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._title_depth:
            self.title_parts.append(data)
        if self._active_link:
            self._active_link_text.append(data)
        self.text_parts.append(data)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(value or "")).strip()


def normalize_url(url: str) -> str:
    value = (url or "").strip()
    if not value:
        raise ValueError("A webpage URL is required.")
    parsed = urlparse(value)
    if not parsed.scheme:
        value = f"https://{value}"
        parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Use an http or https URL.")
    return value


def fetch_page(url: str, timeout: int = 18) -> WebPage:
    target = normalize_url(url)
    request = Request(target, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        raw = response.read(MAX_FETCH_BYTES + 1)
        final_url = response.geturl()
        headers = response.headers
    charset = headers.get_content_charset() or "utf-8"
    html = raw[:MAX_FETCH_BYTES].decode(charset, errors="replace")
    parser = PageParser()
    parser.feed(html)
    title = clean_text(" ".join(parser.title_parts))
    text = clean_text(" ".join(parser.text_parts))
    links = normalize_links(final_url, parser.links)
    return WebPage(final_url, title, text[:MAX_PAGE_TEXT], links)


def normalize_links(base_url: str, links: list[tuple[str, str]]) -> list[tuple[str, str]]:
    normalized: list[tuple[str, str]] = []
    seen: set[str] = set()
    for href, label in links:
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        cleaned = parsed._replace(fragment="").geturl()
        if cleaned in seen:
            continue
        seen.add(cleaned)
        normalized.append((cleaned, label))
    return normalized


def related_links(page: WebPage, limit: int = 6) -> list[str]:
    base_host = urlparse(page.url).netloc.lower().removeprefix("www.")
    keywords = [
        "pricing",
        "price",
        "plans",
        "minecraft",
        "discord",
        "bot",
        "vps",
        "dedicated",
        "server",
        "features",
        "locations",
        "datacenter",
        "hardware",
        "support",
        "ddos",
        "terms",
    ]
    scored: list[tuple[int, str]] = []
    for link, label in page.links:
        parsed = urlparse(link)
        host = parsed.netloc.lower().removeprefix("www.")
        if host != base_host:
            continue
        haystack = f"{parsed.path} {parsed.query} {label}".lower()
        score = sum(1 for keyword in keywords if keyword in haystack)
        if score:
            scored.append((score, link))
    scored.sort(key=lambda item: (-item[0], len(item[1])))
    selected: list[str] = []
    for _, link in scored:
        if link != page.url and link not in selected:
            selected.append(link)
        if len(selected) >= limit:
            break
    return selected


def duckduckgo_result_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        uddg = parse_qs(parsed.query).get("uddg", [""])[0]
        return unquote(uddg) if uddg else url
    return url


def bing_result_url(url: str) -> str:
    parsed = urlparse(url)
    if "bing.com" not in parsed.netloc or not parsed.path.startswith("/ck/"):
        return url
    encoded = parse_qs(parsed.query).get("u", [""])[0]
    if not encoded:
        return url
    if encoded.startswith("a1"):
        encoded = encoded[2:]
    padding = "=" * (-len(encoded) % 4)
    try:
        return base64.urlsafe_b64decode(f"{encoded}{padding}").decode("utf-8", errors="replace")
    except ValueError:
        return url


def search_links(search_url: str, limit: int) -> list[dict[str, str]]:
    try:
        page = fetch_page(search_url, timeout=12)
    except (HTTPError, URLError, TimeoutError, ValueError):
        return []
    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for url, label in page.links:
        result_url = bing_result_url(duckduckgo_result_url(url))
        parsed = urlparse(result_url)
        if parsed.scheme not in {"http", "https"}:
            continue
        if any(blocked in parsed.netloc for blocked in ["duckduckgo.com", "bing.com", "microsoft.com"]):
            continue
        if result_url in seen:
            continue
        seen.add(result_url)
        results.append({"title": clean_text(label) or parsed.netloc, "url": result_url})
        if len(results) >= limit:
            break
    return results


def web_search(query: str, limit: int = 5) -> list[dict[str, str]]:
    encoded = quote_plus(query)
    results = search_links(f"https://duckduckgo.com/html/?q={encoded}", limit)
    if len(results) < limit:
        existing = {item["url"] for item in results}
        for item in search_links(f"https://www.bing.com/search?q={encoded}", limit):
            if item["url"] not in existing:
                results.append(item)
            if len(results) >= limit:
                break
    return results


def collect_context(url: str, notes: str, use_web_search: bool) -> tuple[str, list[str], list[str]]:
    warnings: list[str] = []
    pages: list[WebPage] = []
    sources: list[str] = []
    main = fetch_page(url)
    pages.append(main)
    sources.append(main.url)

    for link in related_links(main):
        try:
            page = fetch_page(link, timeout=12)
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            warnings.append(f"Could not fetch related page {link}: {exc}")
            continue
        pages.append(page)
        sources.append(page.url)

    search_results: list[dict[str, str]] = []
    if use_web_search:
        domain = urlparse(main.url).netloc
        queries = [
            f"site:{domain} pricing plans RAM CPU locations support",
            f"{main.title or domain} minecraft discord bot vps dedicated hosting plans",
        ]
        for query in queries:
            search_results.extend(web_search(query, limit=4))

    chunks: list[str] = [
        f"User notes:\n{notes.strip() or '(none)'}",
        f"Primary URL: {main.url}",
    ]
    for page in pages:
        chunks.append(f"\nSOURCE PAGE: {page.title or page.url}\nURL: {page.url}\nTEXT:\n{page.text}")
    if search_results:
        chunks.append(
            "\nWEB SEARCH RESULTS:\n"
            + "\n".join(f"- {item['title']} | {item['url']}" for item in search_results)
        )
        sources.extend(item["url"] for item in search_results)

    context = "\n\n".join(chunks)
    return context[:MAX_CONTEXT_TEXT], dedupe(sources), warnings


def dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def ollama_api_base() -> str:
    host = OLLAMA_HOST.strip().rstrip("/")
    if not host.startswith(("http://", "https://")):
        host = f"http://{host}"
    return host


def call_ollama(model: str, context: str) -> str:
    payload = {
        "model": model or DEFAULT_IMPORT_MODEL,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1},
        "messages": [
            {
                "role": "system",
                "content": extraction_system_prompt(),
            },
            {
                "role": "user",
                "content": f"Extract a CMS host draft from this web context:\n\n{context}",
            },
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        f"{ollama_api_base()}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=180) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data.get("message", {}).get("content", "")


def extraction_system_prompt() -> str:
    schema = {
        "name": "",
        "website_url": "",
        "plan_url": "",
        "logo_url": "",
        "summary": "",
        "hosting_types": HOSTING_TYPE_OPTIONS,
        "recommendation_tier": "unreviewed",
        "status": "unreviewed",
        "tags": [],
        "location_tags": [],
        "locations": [],
        "support_channels": [],
        "server_types": [],
        "source_urls": [],
        "pros": [],
        "cons": [],
        "caveats": "",
        "trust_notes": "",
        "plans": [
            {
                "name": "",
                "price_monthly_usd": "",
                "ram_gb": "",
                "player_slots": "",
                "recommended_players": "",
                "storage_gb": "",
                "storage_type": "",
                "plan_url": "",
                "price_notes": "",
                "cpu_model": "",
                "cpu_vendor": "",
                "cpu_cores": "",
                "cpu_allocation": "",
                "advertised_clock_ghz": "",
                "boost_clock_ghz": "",
                "memory_speed_mhz": "",
                "benchmark_score": "",
                "panel": "",
                "ddos_protection": "",
                "modpack_support": "",
                "location_tags": [],
                "support_channels": [],
                "server_types": [],
                "support_notes": "",
                "notes": "",
            }
        ],
    }
    return (
        "You extract hosting-provider facts for a local CMS. Return one JSON object only. "
        "Never include markdown. Do not invent facts; leave unknown fields as empty strings or empty arrays. "
        f"Allowed hosting_types: {HOSTING_TYPE_OPTIONS}. "
        f"Allowed recommendation_tier values: {TIER_OPTIONS}. "
        f"Allowed status values: {STATUS_OPTIONS}. "
        f"Allowed category_picks values: {CATEGORY_OPTIONS}. "
        f"Risk tags {HOST_TAG_OPTIONS} must only be used if there is clear evidence in the context. "
        "Each real purchasable plan/tier must be a separate item in plans, with its own price, RAM, CPU/specs, "
        "locations, support, storage, panel, DDoS, modpack support, URL, and notes when available. "
        "Use USD numeric prices when clear; otherwise leave the price as written only in price_notes. "
        "Use lowercase short tags and region codes such as us-east or eu-west when possible. "
        "User notes have priority over page text if they conflict. "
        f"Return this shape: {json.dumps(schema)}"
    )


def parse_json_object(value: str) -> dict[str, Any]:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Ollama did not return a JSON object.")
        payload = json.loads(text[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("Ollama returned JSON, but not an object.")
    return payload


def clean_imported_host(payload: dict[str, Any], source_url: str, sources: list[str]) -> dict[str, Any]:
    host = deepcopy_host()
    for field in TEXT_FIELDS:
        if field in payload and payload[field] is not None:
            host[field] = str(payload[field]).strip()
    for field in LIST_FIELDS:
        host[field] = normalize_list(payload.get(field, []))

    host["website_url"] = host["website_url"] or source_url
    host["plan_url"] = host["plan_url"] or source_url
    host["last_verified"] = host["last_verified"] or date.today().isoformat()
    host["recommendation_tier"] = (
        host["recommendation_tier"] if host["recommendation_tier"] in TIER_OPTIONS else "unreviewed"
    )
    host["status"] = host["status"] if host["status"] in STATUS_OPTIONS else "unreviewed"
    host["hosting_types"] = [item for item in host["hosting_types"] if item in HOSTING_TYPE_OPTIONS]
    if not host["hosting_types"]:
        host["hosting_types"] = ["minecraft"]
    host["category_picks"] = [item for item in host["category_picks"] if item in CATEGORY_OPTIONS]
    host["source_urls"] = dedupe([*host["source_urls"], *sources, source_url])

    plans: list[dict[str, Any]] = []
    for item in payload.get("plans", []):
        if not isinstance(item, dict):
            continue
        plan: dict[str, Any] = {}
        for field in PLAN_TEXT_FIELDS:
            plan[field] = str(item.get(field, "") or "").strip()
        for field in PLAN_LIST_FIELDS:
            plan[field] = normalize_list(item.get(field, []))
        plan["max_memory_gb"] = plan.get("ram_gb", "")
        if any(plan.values()) or any(plan[field] for field in PLAN_LIST_FIELDS):
            plans.append(plan)
    host["plans"] = plans
    return normalize_host(host)


def deepcopy_host() -> dict[str, Any]:
    return json.loads(json.dumps(DEFAULT_HOST))


def import_host_from_url(
    url: str,
    notes: str = "",
    model: str = DEFAULT_IMPORT_MODEL,
    use_web_search: bool = True,
) -> dict[str, Any]:
    normalized_url = normalize_url(url)
    context, sources, warnings = collect_context(normalized_url, notes, use_web_search)
    response = call_ollama(model or DEFAULT_IMPORT_MODEL, context)
    payload = parse_json_object(response)
    host = clean_imported_host(payload, normalized_url, sources)
    return {
        "host": host,
        "model": model or DEFAULT_IMPORT_MODEL,
        "sources": sources,
        "warnings": warnings,
    }
