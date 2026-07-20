#!/usr/bin/env python3
"""Update a memory by id (PUT /api/memories/[id]).

    python update_memory.py --id <id> --title "New title" --content "New body" \
        --project-slug hermes --tags vps --importance 0.9

Only fields you pass are changed; omitted fields keep their current values.
"""
from __future__ import annotations

import argparse
import json
import sys

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def main() -> int:
    p = argparse.ArgumentParser(description="Update a Mnemo memory")
    p.add_argument("--id", required=True)
    p.add_argument("--type", choices=["LESSON", "CONVENTION", "DECISION", "FACT"], default=None)
    p.add_argument("--title", default=None)
    p.add_argument("--content", default=None)
    p.add_argument("--tags", default=None, help="comma-separated (replaces)")
    p.add_argument("--project-slug", dest="project_slug", default=None, help="slug; pass 'null' for global")
    p.add_argument("--project-id", dest="project_id", default=None)
    p.add_argument("--importance", type=float, default=None)
    p.add_argument("--expires-at", dest="expires_at", default=None)
    p.add_argument("--source", choices=["USER_SAID", "AGENT_INFERRED", "CORRECTION", "IMPORTED"], default=None)
    args = p.parse_args()

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)
    headers["Content-Type"] = "application/json"

    body: dict = {}
    if args.type is not None:
        body["type"] = args.type
    if args.title is not None:
        body["title"] = args.title
    if args.content is not None:
        body["content"] = args.content
    if args.tags is not None:
        body["tags"] = [t.strip() for t in args.tags.split(",") if t.strip()]
    if args.project_slug is not None:
        body["projectSlug"] = None if args.project_slug.lower() == "null" else args.project_slug
    if args.project_id is not None:
        body["projectId"] = None if args.project_id.lower() == "null" else args.project_id
    if args.importance is not None:
        body["importance"] = args.importance
    if args.expires_at is not None:
        body["expiresAt"] = None if args.expires_at.lower() == "null" else args.expires_at
    if args.source is not None:
        body["source"] = args.source

    url = build_url(base, f"/api/memories/{args.id}")
    resp = request_with_retry("PUT", url, headers=headers, json_body=body)

    if resp.status_code == 200:
        sys.stdout.write(json.dumps(resp.json(), indent=2) + "\n")
        return 0
    sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())