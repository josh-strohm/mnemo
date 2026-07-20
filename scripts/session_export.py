#!/usr/bin/env python3
"""Export memories from Mnemo in JSON, markdown, or hermes-txt form.

    python session_export.py --format markdown --project hermes --max-chars 4000
    python session_export.py --format json --project all --limit 200
    python session_export.py --format hermes-txt --project all > session.txt

JSON calls GET /api/memories; markdown and hermes-txt call GET /api/export
(with ?format=). Auth and retry are handled by mnemo_common (loads
~/code/mnemo/.env then ~/.hermes/.env). Soft-deleted memories are excluded
by default; use --include-deleted on JSON/markdown to surface them.
"""
from __future__ import annotations

import argparse
import json
import sys

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def main() -> int:
    p = argparse.ArgumentParser(description="Export memories from Mnemo")
    p.add_argument(
        "--format",
        choices=["json", "markdown", "hermes-txt"],
        default="markdown",
        help="output format (markdown default; hermes-txt is one line per memory)",
    )
    p.add_argument("--project", default="global", help="slug | id | all | global")
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--sort", choices=["newest", "oldest", "updated"], default="newest")
    p.add_argument("--q", default=None, help="query (keyword relevance)")
    p.add_argument("--max-chars", dest="max_chars", type=int, default=None)
    p.add_argument("--priority", choices=["importance", "recent", "query"], default=None)
    p.add_argument("--include-expired", dest="include_expired", action="store_true")
    p.add_argument(
        "--include-deleted",
        dest="include_deleted",
        action="store_true",
        help="(JSON only) include soft-deleted memories in the response",
    )
    args = p.parse_args()

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)

    if args.format == "json":
        params = {
            "project": args.project,
            "limit": args.limit,
            "offset": args.offset,
            "sort": args.sort,
            "q": args.q,
            "include_deleted": "true" if args.include_deleted else None,
        }
        url = build_url(base, "/api/memories", params)
        resp = request_with_retry("GET", url, headers=headers)
        if resp.status_code != 200:
            sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
            return 1
        total = resp.headers.get("X-Total-Count", "?")
        data = resp.json()
        sys.stdout.write(json.dumps(data, indent=2))
        sys.stderr.write(f"\n# X-Total-Count: {total}\n")
        return 0

    # markdown or hermes-txt → /api/export?format=...
    params = {
        "project": args.project,
        "max_chars": args.max_chars,
        "priority": args.priority if (args.priority or args.q) else "recent",
        "q": args.q,
        "include_expired": "true" if args.include_expired else None,
        "format": args.format,
    }
    url = build_url(base, "/api/export", params)
    resp = request_with_retry("GET", url, headers=headers)
    if resp.status_code != 200:
        sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
        return 1
    sys.stdout.write(resp.text)
    sys.stderr.write(
        f"\n# X-Mnemo-Tokens: {resp.headers.get('X-Mnemo-Tokens', '?')}"
        f"  X-Mnemo-Count: {resp.headers.get('X-Mnemo-Count', '?')}\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())