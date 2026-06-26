from __future__ import annotations

from pathlib import Path

from flask import (
    Flask,
    abort,
    flash,
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
                    " ".join(host.get("locations", [])),
                ]
            ).lower()
        ]
    if tier:
        filtered = [host for host in filtered if host.get("recommendation_tier") == tier]
    if category:
        filtered = [host for host in filtered if category in host.get("category_picks", [])]
    if status:
        filtered = [host for host in filtered if host.get("status") == status]

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
        filters={"q": query, "tier": tier, "category": category, "status": status},
    )


@app.route("/hosts/new", methods=["GET", "POST"])
def new_host():
    if request.method == "POST":
        hosts = load_hosts()
        host = host_from_form(existing_ids={item["id"] for item in hosts})
        if not host["name"]:
            flash("Host name is required.", "error")
            return render_template("host_form.html", host=host, mode="new")
        hosts.append(host)
        save_hosts(hosts)
        flash(f"Added {host['name']}.", "success")
        return redirect(url_for("edit_host", host_id=host["id"]))

    return render_template("host_form.html", host=DEFAULT_HOST.copy(), mode="new")


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
            return render_template("host_form.html", host=updated, mode="edit")
        for index, item in enumerate(hosts):
            if item["id"] == host_id:
                hosts[index] = updated
                break
        save_hosts(hosts)
        flash(f"Saved {updated['name']}.", "success")
        return redirect(url_for("edit_host", host_id=updated["id"]))

    return render_template("host_form.html", host=host, mode="edit")


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
    ]:
        host[field] = request.form.get(field, "").strip()

    if existing:
        host["id"] = existing["id"]
    else:
        host["id"] = unique_slug(host["name"] or "host", existing_ids)

    try:
        host["rank"] = int(request.form.get("rank", "999"))
    except ValueError:
        host["rank"] = 999

    host["category_picks"] = [
        category
        for category in request.form.getlist("category_picks")
        if category in CATEGORY_OPTIONS
    ]
    host["locations"] = normalize_list(request.form.get("locations", ""))
    host["server_types"] = normalize_list(request.form.get("server_types", ""))
    host["source_urls"] = normalize_list(request.form.get("source_urls", ""))
    host["pros"] = normalize_list(request.form.get("pros", ""))
    host["cons"] = normalize_list(request.form.get("cons", ""))
    return host


if __name__ == "__main__":
    app.run(debug=True)
