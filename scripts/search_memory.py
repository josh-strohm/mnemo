#!/usr/bin/env python3
"""Search Mnemo memories (GET /api/search).

    python search_memory.py --q "front bolt keys" --project my-house --k 5
    python search_memory.py --q 195.26.248.26 --project all
"""
from __future__ import annotations

import argparse
import json
import sys

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def main() -> int:
    p = argparse.ArgumentParser(description="Search Mnemo memories")
    p.add_argument("--q", required=True)
    p.add_argument("--project", default="all")
    p.add_argument("--k", type=int, default=10)
    p.add_argument("--include-expired", dest="include_expired", action="store_true")
    args = p.parse_args()

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)

    params = {
        "q": args.q,
        "project": args.project,
        "k": args.k,
        "include_expired": "true" if args.include_expired else None,
    }
    url = build_url(base, "/api/search", params)
    resp = request_with_retry("GET", url, headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        sys.stdout.write(json.dumps(data, indent=2) + "\n")
        sys.stderr.write(f"# hits: {len(data)}\n")
        return 0
    sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())