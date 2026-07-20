#!/usr/bin/env python3
"""Bulk-import memories into Mnemo (POST /api/memories/batch).

Reads a JSON array (or an object with a `memories` key) from a file or
stdin, POSTs it to /api/memories/batch, and prints a per-entry report.

    # from a file
    python bulk_import.py memories.json --project-slug hermes
    # from stdin
    cat memories.json | python bulk_import.py -

    # --dry-run validates input and prints the parsed entries without
    # hitting the network.
    # --allow-duplicate skips duplicate detection on the server.
    # --create-missing-projects=no stops the server from auto-creating
    # projects referenced in entries.projectSlug that don't exist yet.

The schema for each entry matches POST /api/memories (type, title,
content, tags, importance, projectSlug, expiresAt, source). Entries may
override per-call projectSlug with --project-slug.

Exit codes:
    0  everything created
    207 mix of created / duplicates / errors (HTTP 207 from server)
    1  invalid local input / network failure
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry

MAX_ENTRIES = 50


def _load_entries(path: str) -> list[dict]:
    if path == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(path).read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if isinstance(parsed, dict) and "memories" in parsed:
        parsed = parsed["memories"]
    if not isinstance(parsed, list):
        sys.stderr.write("input must be a JSON array or {\"memories\": [...]}\n")
        raise SystemExit(1)
    return parsed


def main() -> int:
    p = argparse.ArgumentParser(description="Bulk-import memories into Mnemo")
    p.add_argument("input", help="path to JSON array, or - for stdin")
    p.add_argument("--project-slug", dest="project_slug", default=None,
                   help="override each entry's projectSlug unless the entry sets one")
    p.add_argument("--allow-duplicate", dest="allow_duplicate", action="store_true")
    p.add_argument("--create-missing-projects", dest="create_missing_projects",
                   choices=["yes", "no"], default="yes",
                   help="default yes; 'no' fails the entry if its projectSlug is unknown")
    p.add_argument("--dry-run", dest="dry_run", action="store_true")
    args = p.parse_args()

    entries = _load_entries(args.input)
    if len(entries) > MAX_ENTRIES:
        sys.stderr.write(f"refusing to import {len(entries)} entries; batch limit is {MAX_ENTRIES}\n")
        return 1
    if len(entries) == 0:
        sys.stderr.write("no entries to import\n")
        return 1

    if args.project_slug:
        for e in entries:
            e.setdefault("projectSlug", args.project_slug)

    if args.dry_run:
        pretty = json.dumps(entries, indent=2)
        sys.stdout.write(pretty + "\n")
        sys.stderr.write(f"# dry-run: {len(entries)} entries would be POSTed\n")
        return 0

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)
    if args.allow_duplicate:
        headers["X-Allow-Duplicate"] = "true"

    body = {
        "memories": entries,
        "allowDuplicate": args.allow_duplicate,
        "createMissingProjects": args.create_missing_projects == "yes",
    }
    url = build_url(base, "/api/memories/batch")
    resp = request_with_retry("POST", url, headers=headers, json_body=body)

    if resp.status_code not in (200, 207):
        sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
        return 1

    data = resp.json()
    created = data.get("created", 0)
    duplicates = data.get("duplicates", 0)
    errors = data.get("errors", 0)
    results = data.get("results", [])

    sys.stderr.write(
        f"# created={created} duplicates={duplicates} errors={errors} "
        f"status={resp.status_code}\n"
    )
    for r in results:
        idx = r.get("index")
        status = r.get("status")
        if status == "created":
            mem = r.get("memory") or {}
            sys.stdout.write(f"[{idx}] CREATED {mem.get('id', '?')} -- {mem.get('title', '')}\n")
        elif status == "duplicate":
            sim = r.get("similar") or []
            similar_ids = ", ".join(s.get("id", "?") for s in sim[:3])
            sys.stdout.write(f"[{idx}] DUPLICATE (similar: {similar_ids})\n")
        else:
            sys.stdout.write(f"[{idx}] ERROR: {r.get('error', 'unknown')}\n")

    if errors > 0:
        return 1
    if duplicates > 0:
        return 207
    return 0


if __name__ == "__main__":
    raise SystemExit(main())