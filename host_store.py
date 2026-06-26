from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
HOSTS_FILE = DATA_DIR / "hosts.json"

TIER_OPTIONS = ["top_pick", "recommended", "situational", "avoid", "unreviewed"]
TIER_LABELS = {
    "top_pick": "Top pick",
    "recommended": "Recommended",
    "situational": "Situational",
    "avoid": "Avoid",
    "unreviewed": "Unreviewed",
}
TIER_ORDER = {tier: index for index, tier in enumerate(TIER_OPTIONS)}

CATEGORY_OPTIONS = [
    "overall",
    "budget",
    "performance",
    "modded",
    "free",
    "small_servers",
    "large_servers",
    "regional",
]
CATEGORY_LABELS = {
    "overall": "Overall",
    "budget": "Budget",
    "performance": "Performance",
    "modded": "Modded",
    "free": "Free",
    "small_servers": "Small servers",
    "large_servers": "Large servers",
    "regional": "Regional",
}

STATUS_OPTIONS = ["unreviewed", "active", "likely_active", "uncertain", "avoid", "inactive"]
STATUS_LABELS = {
    "unreviewed": "Unreviewed",
    "active": "Active",
    "likely_active": "Likely active",
    "uncertain": "Uncertain",
    "avoid": "Avoid",
    "inactive": "Inactive",
}

LIST_FIELDS = [
    "category_picks",
    "tags",
    "locations",
    "server_types",
    "source_urls",
    "pros",
    "cons",
]
TEXT_FIELDS = [
    "id",
    "name",
    "website_url",
    "plan_url",
    "logo_url",
    "summary",
    "cpu_model",
    "cpu_vendor",
    "advertised_clock_ghz",
    "boost_clock_ghz",
    "cpu_notes",
    "ram_notes",
    "storage_type",
    "panel",
    "ddos_protection",
    "modpack_support",
    "price_notes",
    "last_verified",
    "status",
    "trust_notes",
    "recommendation_tier",
    "caveats",
]

DEFAULT_HOST: dict[str, Any] = {
    "id": "",
    "name": "",
    "website_url": "",
    "plan_url": "",
    "logo_url": "",
    "summary": "",
    "cpu_model": "",
    "cpu_vendor": "",
    "advertised_clock_ghz": "",
    "boost_clock_ghz": "",
    "cpu_notes": "",
    "ram_notes": "",
    "storage_type": "",
    "locations": [],
    "panel": "",
    "ddos_protection": "",
    "modpack_support": "",
    "server_types": [],
    "price_notes": "",
    "last_verified": "",
    "source_urls": [],
    "status": "unreviewed",
    "trust_notes": "",
    "recommendation_tier": "unreviewed",
    "rank": 999,
    "category_picks": [],
    "tags": [],
    "pros": [],
    "cons": [],
    "caveats": "",
}


def ensure_data_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not HOSTS_FILE.exists():
        save_hosts([])


def load_hosts() -> list[dict[str, Any]]:
    ensure_data_file()
    with HOSTS_FILE.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    hosts = payload.get("hosts", []) if isinstance(payload, dict) else []
    return sort_hosts([normalize_host(host) for host in hosts])


def save_hosts(hosts: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    normalized = sort_hosts([normalize_host(host) for host in hosts])
    with HOSTS_FILE.open("w", encoding="utf-8") as handle:
        json.dump({"hosts": normalized}, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def normalize_host(host: dict[str, Any]) -> dict[str, Any]:
    clean = deepcopy(DEFAULT_HOST)
    for field in TEXT_FIELDS:
        if field in host and host[field] is not None:
            clean[field] = str(host[field]).strip()

    for field in LIST_FIELDS:
        clean[field] = normalize_list(host.get(field, []))

    clean["category_picks"] = [
        category for category in clean["category_picks"] if category in CATEGORY_OPTIONS
    ]
    clean["tags"] = sorted({tag.lower() for tag in clean["tags"]})

    tier = clean.get("recommendation_tier") or "unreviewed"
    clean["recommendation_tier"] = tier if tier in TIER_OPTIONS else "unreviewed"

    status = clean.get("status") or "unreviewed"
    clean["status"] = status if status in STATUS_OPTIONS else "unreviewed"

    try:
        clean["rank"] = int(host.get("rank", 999))
    except (TypeError, ValueError):
        clean["rank"] = 999
    if clean["rank"] < 1:
        clean["rank"] = 1

    if clean["id"]:
        clean["id"] = slugify(clean["id"])
    elif clean["name"]:
        clean["id"] = slugify(clean["name"])

    return clean


def normalize_list(value: Any) -> list[str]:
    if isinstance(value, str):
        parts = re.split(r"[\n,]", value)
    elif isinstance(value, list):
        parts = value
    else:
        parts = []
    return [str(part).strip() for part in parts if str(part).strip()]


def sort_hosts(hosts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        hosts,
        key=lambda host: (
            TIER_ORDER.get(host.get("recommendation_tier", "unreviewed"), 99),
            int(host.get("rank", 999)),
            host.get("name", "").lower(),
        ),
    )


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "host"


def unique_slug(base: str, existing_ids: set[str]) -> str:
    root = slugify(base)
    candidate = root
    suffix = 2
    while candidate in existing_ids:
        candidate = f"{root}-{suffix}"
        suffix += 1
    return candidate


def find_host(hosts: list[dict[str, Any]], host_id: str) -> dict[str, Any] | None:
    for host in hosts:
        if host.get("id") == host_id:
            return host
    return None


def all_tags(hosts: list[dict[str, Any]]) -> list[str]:
    tags: set[str] = set()
    for host in hosts:
        tags.update(host.get("tags", []))
    return sorted(tags)
