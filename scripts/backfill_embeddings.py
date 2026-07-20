#!/usr/bin/env python3
"""Backfill embeddings for memories that don't yet have one.

Lists every memory (paginating /api/memories), then for each memory without
an embedding PUTs its current title/content back. When an OPENAI_API_KEY is
configured on the server, that PUT asynchronously regenerates the embedding.

Note: this bumps updatedAt for the touched memories (the no-op content
re-write is how the server-side embedding hook is triggered over the API).
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def list_all(env, headers, base):
    seen = []
    offset = 0
    while True:
        url = build_url(
            base,
            "/api/memories",
            {"project": "all", "limit": 200, "offset": offset, "sort": "newest"},
        )
        resp = request_with_retry("GET", url, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"list failed: HTTP {resp.status_code}: {resp.text}")
        page = resp.json()
        if not page:
            break
        seen.extend(page)
        offset += len(page)
        if len(page) < 200:
            break
    return seen


def main() -> int:
    p = argparse.ArgumentParser(description="Backfill Mnemo memory embeddings")
    p.add_argument("--project", default="all")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--sleep", type=float, default=0.2, help="politeness delay between PUTs")
    args = p.parse_args()

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)
    headers["Content-Type"] = "application/json"

    memories = list_all(env, headers, base)
    missing = [m for m in memories if not m.get("embedding")]
    sys.stderr.write(f"# total={len(memories)} missing_embedding={len(missing)}\n")
    if args.dry_run:
        for m in missing:
            sys.stdout.write(f"{m['id']}  {m.get('title','')}\n")
        return 0

    updated = 0
    for m in missing:
        url = build_url(base, f"/api/memories/{m['id']}")
        body = {"title": m["title"], "content": m["content"]}
        if m.get("projectId"):
            body["projectId"] = m["projectId"]
        resp = request_with_retry("PUT", url, headers=headers, json_body=body)
        if resp.status_code == 200:
            updated += 1
            sys.stderr.write(f"ok   {m['id']}\n")
        else:
            sys.stderr.write(f"fail {m['id']} HTTP {resp.status_code}: {resp.text}\n")
        time.sleep(args.sleep)
    sys.stderr.write(f"# backfilled={updated}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())