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
    "hardware_tiers": [],
    "public_offers": [],
    "plan_count": 0,
    "hardware_tier_count": 0,
    "starting_price_usd": "",
    "lowest_price_per_gb_usd": "",
    "max_plan_ram_gb": "",
    "max_plan_player_slots": "",
    "max_recommended_players": "",
    "max_cpu_cores": "",
}

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
    "max_memory_gb",
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
PLAN_LIST_FIELDS = ["hardware_tier_ids", "location_tags", "support_channels", "server_types"]

HARDWARE_TIER_TEXT_FIELDS = [
    "id",
    "name",
    "cpu_model",
    "cpu_vendor",
    "advertised_clock_ghz",
    "boost_clock_ghz",
    "cpu_cores",
    "cpu_allocation",
    "max_memory_gb",
    "memory_speed_mhz",
    "benchmark_score",
    "storage_type",
    "panel",
    "ddos_protection",
    "modpack_support",
    "support_notes",
    "price_notes",
    "notes",
]
HARDWARE_TIER_LIST_FIELDS = [
    "locations",
    "location_tags",
    "support_channels",
    "server_types",
    "source_urls",
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
    clean["hardware_tiers"] = normalize_hardware_tiers(host.get("hardware_tiers", []))
    merge_nested_location_tags(clean)
    clean["public_offers"] = build_public_offers(clean)
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

    plans: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        plan = {field: str(item.get(field, "") or "").strip() for field in PLAN_TEXT_FIELDS}
        for field in PLAN_LIST_FIELDS:
            plan[field] = normalize_list(item.get(field, []))
        plan["hardware_tier_ids"] = [slugify(tier_id) for tier_id in plan["hardware_tier_ids"]]
        plan["location_tags"] = sorted({tag.lower() for tag in plan["location_tags"]})
        plan["support_channels"] = sorted({channel.lower() for channel in plan["support_channels"]})
        if any(plan.values()) or any(plan[field] for field in PLAN_LIST_FIELDS):
            plans.append(plan)
    return plans


def normalize_hardware_tiers(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    tiers: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            continue
        tier = {
            field: str(item.get(field, "") or "").strip()
            for field in HARDWARE_TIER_TEXT_FIELDS
        }
        for field in HARDWARE_TIER_LIST_FIELDS:
            tier[field] = normalize_list(item.get(field, []))
        tier["location_tags"] = sorted({tag.lower() for tag in tier["location_tags"]})
        tier["support_channels"] = sorted({channel.lower() for channel in tier["support_channels"]})
        if not any(tier[field] for field in HARDWARE_TIER_TEXT_FIELDS if field != "id") and not any(
            tier[field] for field in HARDWARE_TIER_LIST_FIELDS
        ):
            continue

        base_id = tier.get("id") or tier.get("name") or tier.get("cpu_model") or f"hardware-{index}"
        tier_id = unique_slug(base_id, seen_ids)
        seen_ids.add(tier_id)
        tier["id"] = tier_id
        tiers.append(tier)
    return tiers


def merge_nested_location_tags(host: dict[str, Any]) -> None:
    tags = set(host.get("location_tags", []))
    locations = set(host.get("locations", []))
    for tier in host.get("hardware_tiers", []):
        tags.update(tier.get("location_tags", []))
        locations.update(tier.get("locations", []))
    for plan in host.get("plans", []):
        tags.update(plan.get("location_tags", []))
    host["location_tags"] = sorted({tag.lower() for tag in tags if tag})
    host["locations"] = sorted({location for location in locations if location})


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


def legacy_hardware_tier(host: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": "host-default",
        "name": "Default hardware",
        "cpu_model": host.get("cpu_model", ""),
        "cpu_vendor": host.get("cpu_vendor", ""),
        "advertised_clock_ghz": host.get("advertised_clock_ghz", ""),
        "boost_clock_ghz": host.get("boost_clock_ghz", ""),
        "cpu_cores": "",
        "cpu_allocation": "",
        "max_memory_gb": host.get("max_memory_gb", ""),
        "memory_speed_mhz": host.get("memory_speed_mhz", ""),
        "benchmark_score": host.get("benchmark_score", ""),
        "storage_type": host.get("storage_type", ""),
        "panel": host.get("panel", ""),
        "ddos_protection": host.get("ddos_protection", ""),
        "modpack_support": host.get("modpack_support", ""),
        "support_channels": host.get("support_channels", []),
        "server_types": host.get("server_types", []),
        "support_notes": host.get("support_notes", ""),
        "price_notes": host.get("price_notes", ""),
        "locations": host.get("locations", []),
        "location_tags": host.get("location_tags", []),
        "source_urls": [],
        "notes": "",
    }


def plan_has_hardware_fields(plan: dict[str, Any]) -> bool:
    return any(
        str(plan.get(field, "") or "").strip()
        for field in [
            "cpu_model",
            "cpu_vendor",
            "advertised_clock_ghz",
            "boost_clock_ghz",
            "cpu_cores",
            "cpu_allocation",
            "max_memory_gb",
            "memory_speed_mhz",
            "benchmark_score",
            "storage_type",
            "panel",
            "ddos_protection",
            "modpack_support",
            "support_notes",
            "price_notes",
        ]
    )


def plan_hardware_tier(plan: dict[str, Any], host: dict[str, Any]) -> dict[str, Any]:
    plan_name = str(plan.get("name", "") or "Plan").strip()
    return {
        "id": f"plan-{slugify(plan_name)}",
        "name": f"{plan_name} hardware",
        "cpu_model": plan.get("cpu_model", "") or host.get("cpu_model", ""),
        "cpu_vendor": plan.get("cpu_vendor", "") or host.get("cpu_vendor", ""),
        "advertised_clock_ghz": plan.get("advertised_clock_ghz", "")
        or host.get("advertised_clock_ghz", ""),
        "boost_clock_ghz": plan.get("boost_clock_ghz", "") or host.get("boost_clock_ghz", ""),
        "cpu_cores": plan.get("cpu_cores", ""),
        "cpu_allocation": plan.get("cpu_allocation", ""),
        "max_memory_gb": plan.get("max_memory_gb", "") or host.get("max_memory_gb", ""),
        "memory_speed_mhz": plan.get("memory_speed_mhz", "") or host.get("memory_speed_mhz", ""),
        "benchmark_score": plan.get("benchmark_score", "") or host.get("benchmark_score", ""),
        "storage_type": plan.get("storage_type", "") or host.get("storage_type", ""),
        "panel": plan.get("panel", "") or host.get("panel", ""),
        "ddos_protection": plan.get("ddos_protection", "") or host.get("ddos_protection", ""),
        "modpack_support": plan.get("modpack_support", "") or host.get("modpack_support", ""),
        "support_channels": plan.get("support_channels", []) or host.get("support_channels", []),
        "server_types": plan.get("server_types", []) or host.get("server_types", []),
        "support_notes": plan.get("support_notes", "") or host.get("support_notes", ""),
        "price_notes": plan.get("price_notes", "") or host.get("price_notes", ""),
        "locations": host.get("locations", []),
        "location_tags": plan.get("location_tags", []) or host.get("location_tags", []),
        "source_urls": [],
        "notes": "",
    }


def offer_value(offer: dict[str, Any], key: str) -> float | None:
    return numeric_value(offer.get(key))


def offer_metric(offer: dict[str, Any], key: str) -> str:
    return str(offer.get(key, "") or "").strip()


def merged_offer_list(plan: dict[str, Any], tier: dict[str, Any], host: dict[str, Any], key: str) -> list[str]:
    explicit = {*plan.get(key, []), *tier.get(key, [])}
    return sorted(explicit or set(host.get(key, [])))


def offer_field(plan: dict[str, Any], tier: dict[str, Any], host: dict[str, Any], key: str) -> str:
    return offer_metric(plan, key) or offer_metric(tier, key) or str(host.get(key, "") or "").strip()


def build_public_offers(host: dict[str, Any]) -> list[dict[str, Any]]:
    plans = host.get("plans") or [{}]
    hardware_tiers = host.get("hardware_tiers") or [legacy_hardware_tier(host)]
    hardware_by_id = {tier["id"]: tier for tier in hardware_tiers}
    offers: list[dict[str, Any]] = []

    for plan_index, plan in enumerate(plans, start=1):
        requested_tier_ids = plan.get("hardware_tier_ids", [])
        if "all" in requested_tier_ids:
            selected_tiers = hardware_tiers
        else:
            selected_tiers = [
                hardware_by_id[tier_id]
                for tier_id in requested_tier_ids
                if tier_id in hardware_by_id
            ]
        if not selected_tiers and plan_has_hardware_fields(plan):
            selected_tiers = [plan_hardware_tier(plan, host)]
        elif not selected_tiers and not host.get("hardware_tiers"):
            selected_tiers = [legacy_hardware_tier(host)]
        elif not selected_tiers:
            selected_tiers = [plan_hardware_tier(plan, host)]

        for tier in selected_tiers:
            explicit_location_tags = {
                *plan.get("location_tags", []),
                *tier.get("location_tags", []),
            }
            explicit_locations = set(tier.get("locations", []))
            location_tags = sorted(explicit_location_tags or set(host.get("location_tags", [])))
            locations = sorted(explicit_locations or set(host.get("locations", [])))
            price = offer_metric(plan, "price_monthly_usd")
            ram = offer_metric(plan, "ram_gb")
            price_per_gb = ""
            price_number = numeric_value(price)
            ram_number = numeric_value(ram)
            if price_number is not None and ram_number and ram_number > 0:
                price_per_gb = format_metric(price_number / ram_number)

            plan_name = offer_metric(plan, "name") or "Plan"
            hardware_name = offer_metric(tier, "name") or offer_metric(tier, "cpu_model") or "Hardware"
            support_channels = merged_offer_list(plan, tier, host, "support_channels")
            server_types = merged_offer_list(plan, tier, host, "server_types")
            offers.append(
                {
                    "id": f"{plan_index}-{tier['id']}",
                    "planName": plan_name,
                    "hardwareName": hardware_name,
                    "label": f"{plan_name} / {hardware_name}",
                    "price": price,
                    "planRam": ram,
                    "players": offer_metric(plan, "player_slots"),
                    "recommendedPlayers": offer_metric(plan, "recommended_players"),
                    "storage": offer_metric(plan, "storage_gb"),
                    "pricePerGb": price_per_gb,
                    "url": offer_metric(plan, "plan_url") or host.get("plan_url", ""),
                    "notes": offer_metric(plan, "notes"),
                    "cpuModel": offer_field(plan, tier, host, "cpu_model"),
                    "cpuVendor": offer_field(plan, tier, host, "cpu_vendor"),
                    "baseGhz": offer_field(plan, tier, host, "advertised_clock_ghz"),
                    "peakGhz": offer_field(plan, tier, host, "boost_clock_ghz"),
                    "cores": offer_metric(plan, "cpu_cores") or offer_metric(tier, "cpu_cores"),
                    "cpuAllocation": offer_metric(plan, "cpu_allocation")
                    or offer_metric(tier, "cpu_allocation"),
                    "maxMemory": offer_field(plan, tier, host, "max_memory_gb"),
                    "memorySpeed": offer_field(plan, tier, host, "memory_speed_mhz"),
                    "benchmark": offer_field(plan, tier, host, "benchmark_score"),
                    "storageType": offer_field(plan, tier, host, "storage_type"),
                    "locations": locations,
                    "locationTags": location_tags,
                    "panel": offer_field(plan, tier, host, "panel"),
                    "ddosProtection": offer_field(plan, tier, host, "ddos_protection"),
                    "modpackSupport": offer_field(plan, tier, host, "modpack_support"),
                    "supportChannels": support_channels,
                    "serverTypes": server_types,
                    "supportNotes": offer_field(plan, tier, host, "support_notes"),
                    "priceNotes": offer_field(plan, tier, host, "price_notes"),
                    "hardwareNotes": offer_metric(tier, "notes"),
                }
            )
    return offers


def apply_plan_summary(host: dict[str, Any]) -> None:
    offers = host.get("public_offers", [])
    prices = [offer_value(offer, "price") for offer in offers]
    rams = [offer_value(offer, "planRam") for offer in offers]
    slots = [offer_value(offer, "players") for offer in offers]
    recommended = [offer_value(offer, "recommendedPlayers") for offer in offers]
    cores = [offer_value(offer, "cores") for offer in offers]

    prices = [value for value in prices if value is not None]
    rams = [value for value in rams if value is not None]
    slots = [value for value in slots if value is not None]
    recommended = [value for value in recommended if value is not None]
    cores = [value for value in cores if value is not None]
    price_per_gb = [
        value
        for value in (offer_value(offer, "pricePerGb") for offer in offers)
        if value is not None
    ]

    host["plan_count"] = len(host["plans"])
    host["hardware_tier_count"] = len(host.get("hardware_tiers", []))
    host["starting_price_usd"] = format_metric(min(prices) if prices else None)
    host["lowest_price_per_gb_usd"] = format_metric(min(price_per_gb) if price_per_gb else None)
    host["max_plan_ram_gb"] = format_metric(max(rams) if rams else None)
    host["max_plan_player_slots"] = format_metric(max(slots) if slots else None)
    host["max_recommended_players"] = format_metric(max(recommended) if recommended else None)
    host["max_cpu_cores"] = format_metric(max(cores) if cores else None)


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
        for offer in host.get("public_offers", []):
            tags.update(offer.get("locationTags", []))
    return sorted(tags)


def all_support_channels(hosts: list[dict[str, Any]]) -> list[str]:
    tags: set[str] = set()
    for host in hosts:
        tags.update(host.get("support_channels", []))
        for plan in host.get("plans", []):
            tags.update(plan.get("support_channels", []))
        for tier in host.get("hardware_tiers", []):
            tags.update(tier.get("support_channels", []))
        for offer in host.get("public_offers", []):
            tags.update(offer.get("supportChannels", []))
    return sorted(tags)
