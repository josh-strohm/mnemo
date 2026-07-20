#!/usr/bin/env python3
"""Search Mnemo memories (GET /api/search).

    python search_memory.py --q "front bolt keys" --project my-house --k 5
    python search_memory.py --q 195.26.248.26 --project all
    python search_memory.py --q "config" --format compact

Note: search always excludes soft-deleted memories regardless of flags;
use --include-deleted only when you want to confirm there are no
trashed matches for your query.
"""
from __future__ import annotations

import argparse
import json
import sys

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def _render(hits: list[dict], fmt: str) -> str:
    if fmt == "compact":
        lines = []
        for h in hits:
            mid = h.get("id", "?")
            title = h.get("title", "")
            score = h.get("score", "?")
            tags = " ".join(f"#{t}" for t in h.get("tags", []))
            lines.append(f"{mid} | {score} | {title} {tags}".rstrip())
        return "\n".join(lines)
    return json.dumps(hits, indent=2)


def main() -> int:
    p = argparse.ArgumentParser(description="Search Mnemo memories")
    p.add_argument("--q", required=True)
    p.add_argument("--project", default="all")
    p.add_argument("--k", type=int, default=10)
    p.add_argument("--include-expired", dest="include_expired", action="store_true")
    p.add_argument(
        "--include-deleted",
        dest="include_deleted",
        action="store_true",
        help="(informational only) hint in logs that deleted memories are excluded",
    )
    p.add_argument(
        "--format",
        choices=["json", "compact"],
        default="json",
        help="output format: json (default) or compact (one line per hit)",
    )
    args = p.parse_args()

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)

    params = {
        "q": args.q,
        "project": args.project,
        "k": args.k,
        "include_expired": "true" if args.include_expired else None,
        # includeDeleted=false is the API default; we forward the flag so the
        # behaviour stays explicit when callers expect soft-deleted memories
        # to be excluded (which they always are for /api/search).
        "include_deleted": "true" if args.include_deleted else "false",
    }
    url = build_url(base, "/api/search", params)
    resp = request_with_retry("GET", url, headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        sys.stdout.write(_render(data, args.format) + "\n")
        sys.stderr.write(f"# hits: {len(data)}\n")
        return 0
    sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())