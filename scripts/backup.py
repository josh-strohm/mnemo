#!/usr/bin/env python3
"""Backup Mnemo to a local JSON file (GET /api/admin/backup).

    python scripts/backup.py
    python scripts/backup.py --output ~/mnemo-backup-2026-07-20.json
    python scripts/backup.py --print          # just dump to stdout

Auth via MNEMO_API_KEY (set in ~/code/mnemo/.env or ~/.hermes/.env).
The download endpoint streams application/json with attachment header
— we just follow the redirect and write to disk.
"""
from __future__ import annotations

import argparse
import datetime
import sys
from pathlib import Path

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def main() -> int:
    p = argparse.ArgumentParser(description="Download Mnemo backup")
    p.add_argument(
        "--output", "-o",
        default=None,
        help="Output JSON path (default: ./mnemo-backup-{date}.json)",
    )
    p.add_argument(
        "--print",
        dest="to_stdout",
        action="store_true",
        help="Dump the backup JSON to stdout (no file written)",
    )
    args = p.parse_args()

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)
    url = build_url(base, "/api/admin/backup")

    resp = request_with_retry("GET", url, headers=headers)
    if resp.status_code != 200:
        sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
        return 1

    body = resp.text
    if args.to_stdout:
        sys.stdout.write(body)
        return 0

    out = args.output or (
        f"mnemo-backup-{datetime.date.today().isoformat()}.json"
    )
    out_path = Path(out).expanduser().resolve()
    out_path.write_text(body, encoding="utf-8")

    sys.stderr.write(f"# wrote {len(body):,} bytes → {out_path}\n")
    sys.stderr.write(
        f"# X-Mnemo-Tokens={resp.headers.get('X-Mnemo-Tokens', '?')} "
        f"X-Mnemo-Count={resp.headers.get('X-Mnemo-Count', '?')}\n",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
