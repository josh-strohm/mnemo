#!/usr/bin/env python3
"""Store a memory in Mnemo (POST /api/memories).

    python store_memory.py --type FACT --title "VPS IP" \
        --content "Contabo VPS at 195.26.248.26" --project-slug hermes \
        --tags vps,infra --importance 0.8 --source USER_SAID

Auth + retry via mnemo_common. Handles 409 possible_duplicate by printing
the suggestion rather than failing silently.
"""
from __future__ import annotations

import argparse
import json
import sys

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def main() -> int:
    p = argparse.ArgumentParser(description="Store a memory in Mnemo")
    p.add_argument("--type", required=True, choices=["LESSON", "CONVENTION", "DECISION", "FACT"])
    p.add_argument("--title", required=True)
    p.add_argument("--content", required=True)
    p.add_argument("--tags", default="", help="comma-separated")
    p.add_argument("--project-slug", dest="project_slug", default=None)
    p.add_argument("--importance", type=float, default=None)
    p.add_argument("--expires-at", dest="expires_at", default=None, help="ISO 8601")
    p.add_argument("--source", choices=["USER_SAID", "AGENT_INFERRED", "CORRECTION", "IMPORTED"], default=None)
    p.add_argument("--allow-duplicate", dest="allow_duplicate", action="store_true")
    args = p.parse_args()

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)
    headers["Content-Type"] = "application/json"

    body = {
        "type": args.type,
        "title": args.title,
        "content": args.content,
        "tags": [t.strip() for t in args.tags.split(",") if t.strip()],
        "importance": args.importance,
        "expiresAt": args.expires_at,
        "source": args.source,
        "allowDuplicate": True if args.allow_duplicate else None,
    }
    if args.project_slug is not None:
        body["projectSlug"] = args.project_slug

    url = build_url(base, "/api/memories")
    resp = request_with_retry("POST", url, headers=headers, json_body=body)

    if resp.status_code == 201:
        sys.stdout.write(json.dumps(resp.json(), indent=2) + "\n")
        return 0
    if resp.status_code == 409:
        sys.stdout.write(
            "Possible duplicate detected. Details:\n"
            + json.dumps(resp.json(), indent=2)
            + "\n"
        )
        return 2
    sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())