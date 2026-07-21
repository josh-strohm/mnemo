#!/usr/bin/env python3
"""POST a Markdown file (with BEGIN/END mnemo blocks) to /api/import.

    python scripts/import_block.py path/to/AGENTS.md
    python scripts/import_block.py ./my-notes.md --project-slug hermes --allow-duplicate
    cat block.md | python scripts/import_block.py -

Parses BEGIN/END mnemo blocks in `content` via the server (lib/importParse.ts)
so the rule is identical to the canonical export rendering. Returns the
per-entry report (created / duplicate / error counts).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def main() -> int:
    p = argparse.ArgumentParser(description="Import BEGIN/END mnemo blocks from a file")
    p.add_argument("file", help="Markdown file path (use '-' for stdin)")
    p.add_argument("--project-slug", dest="project_slug", default=None,
                   help="route imported memories into a specific project")
    p.add_argument("--allow-duplicate", dest="allow_duplicate", action="store_true")
    p.add_argument("--source", default="IMPORTED",
                   help="importance/source tag for created memories")
    p.add_argument("--create-missing-projects", dest="create_missing_projects",
                   choices=["yes", "no"], default="yes")
    args = p.parse_args()

    if args.file == "-":
        content = sys.stdin.read()
        src = "<stdin>"
    else:
        content = Path(args.file).read_text(encoding="utf-8")
        src = args.file

    if not content.strip():
        sys.stderr.write("error: empty content\n")
        return 1

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)
    if args.allow_duplicate:
        headers["X-Allow-Duplicate"] = "true"

    body = {
        "content": content,
        "projectSlug": args.project_slug,
        "allowDuplicate": args.allow_duplicate,
        "source": args.source,
        "createMissingProjects": args.create_missing_projects == "yes",
    }

    url = build_url(base, "/api/import")
    resp = request_with_retry("POST", url, headers=headers, json_body=body)
    if resp.status_code not in (200, 207):
        sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
        return 1

    data = resp.json()
    created = data.get("created", 0)
    duplicates = data.get("duplicates", 0)
    errors = data.get("errors", 0)
    parsed = data.get("parsedEntries", 0)

    sys.stderr.write(
        f"# {src}\n"
        f"# parsedEntries={parsed} created={created} duplicates={duplicates} errors={errors}\n"
        f"# status={resp.status_code}\n"
    )
    sys.stdout.write(json.dumps(data, indent=2))
    sys.stdout.write("\n")

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
