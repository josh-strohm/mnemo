#!/usr/bin/env python3
"""Delete a memory by id (DELETE /api/memories/[id]).

    python delete_memory.py --id <id>
"""
from __future__ import annotations

import argparse
import json
import sys

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry


def main() -> int:
    p = argparse.ArgumentParser(description="Delete a Mnemo memory")
    p.add_argument("--id", required=True)
    args = p.parse_args()

    env = load_env()
    base = get_base_url(env)
    headers = auth_headers(env)

    url = build_url(base, f"/api/memories/{args.id}")
    resp = request_with_retry("DELETE", url, headers=headers)

    if resp.status_code == 200:
        sys.stdout.write(json.dumps(resp.json(), indent=2) + "\n")
        return 0
    sys.stderr.write(f"HTTP {resp.status_code}: {resp.text}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())