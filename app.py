from __future__ import annotations

from pathlib import Path

from flask import (
    Flask,
    abort,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    url_for,
)

from build_site import build_site
from host_store import (
    CATEGORY_LABELS,
    CATEGORY_OPTIONS,
    DEFAULT_HOST,
    STATUS_LABELS,
    STATUS_OPTIONS,
    TIER_LABELS,
    TIER_OPTIONS,
    all_location_tags,
    all_support_channels,
    all_tags,
    find_host,
    load_hosts,
    normalize_list,
    save_hosts,
    sort_hosts,
    unique_slug,
)

ROOT_DIR = Path(__file__).resolve().parent
DOCS_DIR = ROOT_DIR / "docs"

app = Flask(__name__)
app.secret_key = "mc-host-guide-local-dev"


@app.context_processor
def inject_options():
    return {
        "tier_options": TIER_OPTIONS,
        "tier_labels": TIER_LABELS,
        "category_options": CATEGORY_OPTIONS,
        "category_labels": CATEGORY_LABELS,
        "status_options": STATUS_OPTIONS,
        "status_labels": STATUS_LABELS,
    }


@app.route("/")
def dashboard():
    hosts = load_hosts()
    query = request.args.get("q", "").strip().lower()
    tier = request.args.get("tier", "").strip()
    category = request.args.get("category", "").strip()
    status = request.args.get("status", "").strip()
    tag = request.args.get("tag", "").strip().lower()
    location_tag = request.args.get("location_tag", "").strip().lower()
    support = request.args.get("support", "").strip().lower()

    filtered = hosts
    if query:
        filtered = [
            host
            for host in filtered
            if query
            in " ".join(
                [
                    host.get("name", ""),
                    host.get("summary", ""),
                    host.get("cpu_model", ""),
                    host.get("cpu_vendor", ""),
                    host.get("advertised_clock_ghz", ""),
                    host.get("boost_clock_ghz", ""),
                    host.get("max_memory_gb", ""),
                    host.get("memory_speed_mhz", ""),
                    host.get("benchmark_score", ""),
                    host.get("support_notes", ""),
                    " ".join(host.get("tags", [])),
                    " ".join(host.get("location_tags", [])),
                    " ".join(host.get("support_channels", [])),
                    " ".join(host.get("locations", [])),
                    " ".join(
                        " ".join(str(value) for value in plan.values())
                        for plan in host.get("plans", [])
                    ),
                ]
            ).lower()
        ]
    if tier:
        filtered = [host for host in filtered if host.get("recommendation_tier") == tier]
    if category:
        filtered = [host for host in filtered if category in host.get("category_picks", [])]
    if status:
        filtered = [host for host in filtered if host.get("status") == status]
    if tag:
        filtered = [host for host in filtered if tag in host.get("tags", [])]
    if location_tag:
        filtered = [
            host for host in filtered if location_tag in host.get("location_tags", [])
        ]
    if support:
        filtered = [host for host in filtered if support in host.get("support_channels", [])]

    stats = {
        "total": len(hosts),
        "shown": len(filtered),
        "top_pick": sum(1 for host in hosts if host.get("recommendation_tier") == "top_pick"),
        "recommended": sum(
            1 for host in hosts if host.get("recommendation_tier") == "recommended"
        ),
        "needs_review": sum(1 for host in hosts if host.get("status") == "unreviewed"),
    }

    return render_template(
        "dashboard.html",
        hosts=filtered,
        stats=stats,
        all_tags=all_tags(hosts),
        all_location_tags=all_location_tags(hosts),
        all_support_channels=all_support_channels(hosts),
        filters={
            "q": query,
            "tier": tier,
            "category": category,
            "status": status,
            "tag": tag,
            "location_tag": location_tag,
            "support": support,
        },
    )


@app.route("/hosts/new", methods=["GET", "POST"])
def new_host():
    if request.method == "POST":
        hosts = load_hosts()
        host = host_from_form(existing_ids={item["id"] for item in hosts})
        if not host["name"]:
            flash("Host name is required.", "error")
            return render_template(
                "host_form.html",
                host=host,
                plan_tiers=editor_plan_tiers(host),
                mode="new",
            )
        hosts.append(host)
        save_hosts(hosts)
        flash(f"Added {host['name']}.", "success")
        return redirect(url_for("edit_host", host_id=host["id"]))

    host = DEFAULT_HOST.copy()
    return render_template(
        "host_form.html",
        host=host,
        plan_tiers=editor_plan_tiers(host),
        mode="new",
    )


@app.route("/hosts/<host_id>/edit", methods=["GET", "POST"])
def edit_host(host_id: str):
    hosts = load_hosts()
    host = find_host(hosts, host_id)
    if not host:
        abort(404)

    if request.method == "POST":
        updated = host_from_form(existing_ids={item["id"] for item in hosts}, existing=host)
        if not updated["name"]:
            flash("Host name is required.", "error")
            return render_template(
                "host_form.html",
                host=updated,
                plan_tiers=editor_plan_tiers(updated),
                mode="edit",
            )
        for index, item in enumerate(hosts):
            if item["id"] == host_id:
                hosts[index] = updated
                break
        save_hosts(hosts)
        flash(f"Saved {updated['name']}.", "success")
        return redirect(url_for("edit_host", host_id=updated["id"]))

    return render_template(
        "host_form.html",
        host=host,
        plan_tiers=editor_plan_tiers(host),
        mode="edit",
    )


@app.route("/hosts/<host_id>/delete", methods=["GET", "POST"])
def delete_host(host_id: str):
    hosts = load_hosts()
    host = find_host(hosts, host_id)
    if not host:
        abort(404)
    if request.method == "POST":
        save_hosts([item for item in hosts if item["id"] != host_id])
        flash(f"Deleted {host['name']}.", "success")
        return redirect(url_for("dashboard"))
    return render_template("delete_host.html", host=host)


@app.route("/hosts/reorder", methods=["GET", "POST"])
def reorder_hosts():
    hosts = load_hosts()
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        order = payload.get("order", [])
        if not isinstance(order, list):
            return jsonify({"ok": False, "error": "Expected order list."}), 400

        by_id = {host["id"]: host for host in hosts}
        reordered = []
        seen = set()
        for host_id in order:
            if host_id in by_id and host_id not in seen:
                seen.add(host_id)
                reordered.append(by_id[host_id])
        reordered.extend(host for host in hosts if host["id"] not in seen)
        for index, host in enumerate(reordered, start=1):
            host["rank"] = index
        save_hosts(reordered)
        return jsonify({"ok": True, "count": len(reordered)})

    return render_template("reorder.html", hosts=hosts)


@app.route("/build", methods=["GET", "POST"])
def build():
    result = build_site()
    flash(
        f"Built {result['page_count']} pages for {result['host_count']} hosts into docs/.",
        "success",
    )
    return render_template("build.html", result=result)


@app.route("/preview")
def preview():
    if not (DOCS_DIR / "index.html").exists():
        result = build_site()
        flash(
            f"Generated preview with {result['page_count']} pages.",
            "success",
        )
    return render_template("preview.html")


@app.route("/site/")
@app.route("/site/<path:filename>")
def preview_file(filename: str = "index.html"):
    return send_from_directory(DOCS_DIR, filename)


def host_from_form(existing_ids: set[str], existing: dict | None = None) -> dict:
    host = DEFAULT_HOST.copy()
    if existing:
        host.update(existing)

    for field in [
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
    ]:
        host[field] = request.form.get(field, "").strip()

    if existing:
        host["id"] = existing["id"]
    else:
        host["id"] = unique_slug(host["name"] or "host", existing_ids)

    rank_value = request.form.get("rank")
    if rank_value is None and existing:
        host["rank"] = existing.get("rank", 999)
    else:
        try:
            host["rank"] = int(rank_value or "999")
        except ValueError:
            host["rank"] = 999

    host["category_picks"] = [
        category
        for category in request.form.getlist("category_picks")
        if category in CATEGORY_OPTIONS
    ]
    host["locations"] = normalize_list(request.form.get("locations", ""))
    host["location_tags"] = normalize_list(request.form.get("location_tags", ""))
    host["tags"] = normalize_list(request.form.get("tags", ""))
    host["support_channels"] = normalize_list(request.form.get("support_channels", ""))
    host["server_types"] = normalize_list(request.form.get("server_types", ""))
    host["source_urls"] = normalize_list(request.form.get("source_urls", ""))
    host["pros"] = normalize_list(request.form.get("pros", ""))
    host["cons"] = normalize_list(request.form.get("cons", ""))
    host["plans"] = plans_from_form()
    host["hardware_tiers"] = []
    return host


def editor_plan_tiers(host: dict) -> list[dict]:
    if host.get("hardware_tiers") and host.get("public_offers"):
        return [plan_from_public_offer(offer) for offer in host["public_offers"]]
    return host.get("plans") or [{}]


def plan_from_public_offer(offer: dict) -> dict:
    name = offer.get("label") or offer.get("planName") or "Tier"
    notes = "\n".join(
        part for part in [offer.get("notes", ""), offer.get("hardwareNotes", "")] if part
    )
    return {
        "name": name,
        "price_monthly_usd": offer.get("price", ""),
        "ram_gb": offer.get("planRam", ""),
        "cpu_cores": offer.get("cores", ""),
        "cpu_allocation": offer.get("cpuAllocation", ""),
        "cpu_model": offer.get("cpuModel", ""),
        "cpu_vendor": offer.get("cpuVendor", ""),
        "advertised_clock_ghz": offer.get("baseGhz", ""),
        "boost_clock_ghz": offer.get("peakGhz", ""),
        "max_memory_gb": offer.get("maxMemory", ""),
        "memory_speed_mhz": offer.get("memorySpeed", ""),
        "benchmark_score": offer.get("benchmark", ""),
        "storage_type": offer.get("storageType", ""),
        "panel": offer.get("panel", ""),
        "ddos_protection": offer.get("ddosProtection", ""),
        "modpack_support": offer.get("modpackSupport", ""),
        "support_notes": offer.get("supportNotes", ""),
        "price_notes": offer.get("priceNotes", ""),
        "player_slots": offer.get("players", ""),
        "recommended_players": offer.get("recommendedPlayers", ""),
        "storage_gb": offer.get("storage", ""),
        "plan_url": offer.get("url", ""),
        "notes": notes,
        "hardware_tier_ids": [],
        "location_tags": offer.get("locationTags", []),
        "support_channels": offer.get("supportChannels", []),
        "server_types": offer.get("serverTypes", []),
    }


def plans_from_form() -> list[dict[str, str]]:
    fields = [
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
        "hardware_tier_ids",
        "location_tags",
        "support_channels",
        "server_types",
        "notes",
    ]
    posted = {field: request.form.getlist(f"plan_{field}") for field in fields}
    length = max((len(values) for values in posted.values()), default=0)
    plans = []
    for index in range(length):
        plan = {
            field: (posted[field][index].strip() if index < len(posted[field]) else "")
            for field in fields
        }
        if any(plan.values()):
            plans.append(plan)
    return plans


if __name__ == "__main__":
    app.run(debug=True)
