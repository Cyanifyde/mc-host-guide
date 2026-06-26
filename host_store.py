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
    "location_tags",
    "support_channels",
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
    "max_memory_gb": "",
    "memory_speed_mhz": "",
    "benchmark_score": "",
    "benchmark_notes": "",
    "cpu_notes": "",
    "ram_notes": "",
    "storage_type": "",
    "locations": [],
    "panel": "",
    "ddos_protection": "",
    "modpack_support": "",
    "server_types": [],
    "support_channels": [],
    "support_notes": "",
    "price_notes": "",
    "last_verified": "",
    "source_urls": [],
    "status": "unreviewed",
    "trust_notes": "",
    "recommendation_tier": "unreviewed",
    "rank": 999,
    "category_picks": [],
    "tags": [],
    "location_tags": [],
    "pros": [],
    "cons": [],
    "caveats": "",
    "plans": [],
    "plan_count": 0,
    "starting_price_usd": "",
    "lowest_price_per_gb_usd": "",
    "max_plan_ram_gb": "",
    "max_plan_player_slots": "",
    "max_recommended_players": "",
}

PLAN_TEXT_FIELDS = [
    "name",
    "price_monthly_usd",
    "ram_gb",
    "player_slots",
    "recommended_players",
    "storage_gb",
    "plan_url",
    "notes",
]


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
    clean["location_tags"] = sorted({tag.lower() for tag in clean["location_tags"]})
    clean["support_channels"] = sorted({tag.lower() for tag in clean["support_channels"]})
    clean["plans"] = normalize_plans(host.get("plans", []))
    apply_plan_summary(clean)

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


def normalize_plans(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    plans: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        plan = {field: str(item.get(field, "") or "").strip() for field in PLAN_TEXT_FIELDS}
        if any(plan.values()):
            plans.append(plan)
    return plans


def numeric_value(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace("$", "").replace(",", "").strip())
    except ValueError:
        return None


def format_metric(value: float | None) -> str:
    if value is None:
        return ""
    if value.is_integer():
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def apply_plan_summary(host: dict[str, Any]) -> None:
    prices = [numeric_value(plan.get("price_monthly_usd")) for plan in host["plans"]]
    rams = [numeric_value(plan.get("ram_gb")) for plan in host["plans"]]
    slots = [numeric_value(plan.get("player_slots")) for plan in host["plans"]]
    recommended = [numeric_value(plan.get("recommended_players")) for plan in host["plans"]]

    prices = [value for value in prices if value is not None]
    rams = [value for value in rams if value is not None]
    slots = [value for value in slots if value is not None]
    recommended = [value for value in recommended if value is not None]

    price_per_gb = []
    for plan in host["plans"]:
        price = numeric_value(plan.get("price_monthly_usd"))
        ram = numeric_value(plan.get("ram_gb"))
        if price is not None and ram and ram > 0:
            price_per_gb.append(price / ram)

    host["plan_count"] = len(host["plans"])
    host["starting_price_usd"] = format_metric(min(prices) if prices else None)
    host["lowest_price_per_gb_usd"] = format_metric(min(price_per_gb) if price_per_gb else None)
    host["max_plan_ram_gb"] = format_metric(max(rams) if rams else None)
    host["max_plan_player_slots"] = format_metric(max(slots) if slots else None)
    host["max_recommended_players"] = format_metric(max(recommended) if recommended else None)


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


def all_location_tags(hosts: list[dict[str, Any]]) -> list[str]:
    tags: set[str] = set()
    for host in hosts:
        tags.update(host.get("location_tags", []))
    return sorted(tags)


def all_support_channels(hosts: list[dict[str, Any]]) -> list[str]:
    tags: set[str] = set()
    for host in hosts:
        tags.update(host.get("support_channels", []))
    return sorted(tags)
