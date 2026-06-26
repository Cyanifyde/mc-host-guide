from __future__ import annotations

import shutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from host_store import CATEGORY_LABELS, ROOT_DIR, STATUS_LABELS, TIER_LABELS, all_tags, load_hosts

DOCS_DIR = ROOT_DIR / "docs"
TEMPLATE_DIR = ROOT_DIR / "templates" / "public"
STATIC_DIR = ROOT_DIR / "static"


def build_site() -> dict[str, int]:
    hosts = load_hosts()
    public_hosts = [host for host in hosts if host.get("status") != "inactive"]

    if DOCS_DIR.exists():
        shutil.rmtree(DOCS_DIR)
    DOCS_DIR.mkdir(parents=True)
    (DOCS_DIR / "hosts").mkdir()
    (DOCS_DIR / ".nojekyll").write_text("", encoding="utf-8")

    if STATIC_DIR.exists():
        shutil.copytree(STATIC_DIR, DOCS_DIR / "static")

    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    common = {
        "tier_labels": TIER_LABELS,
        "category_labels": CATEGORY_LABELS,
        "status_labels": STATUS_LABELS,
    }

    top_hosts = [
        host
        for host in public_hosts
        if host.get("recommendation_tier") in {"top_pick", "recommended", "situational"}
    ]
    available_tags = all_tags(public_hosts)

    render(
        env,
        "home.html",
        DOCS_DIR / "index.html",
        hosts=public_hosts,
        top_hosts=top_hosts[:8],
        all_tags=available_tags,
        root_prefix="",
        active_page="home",
        **common,
    )
    render(
        env,
        "directory.html",
        DOCS_DIR / "directory.html",
        hosts=public_hosts,
        all_tags=available_tags,
        root_prefix="",
        active_page="directory",
        **common,
    )
    render(
        env,
        "methodology.html",
        DOCS_DIR / "methodology.html",
        root_prefix="",
        active_page="methodology",
        **common,
    )

    for host in public_hosts:
        render(
            env,
            "host.html",
            DOCS_DIR / "hosts" / f"{host['id']}.html",
            host=host,
            root_prefix="../",
            active_page="directory",
            **common,
        )

    return {"host_count": len(public_hosts), "page_count": len(public_hosts) + 3}
def render(env: Environment, template_name: str, target: Path, **context) -> None:
    template = env.get_template(template_name)
    target.write_text(template.render(**context), encoding="utf-8")


if __name__ == "__main__":
    result = build_site()
    print(f"Built {result['page_count']} pages for {result['host_count']} hosts into docs/.")
