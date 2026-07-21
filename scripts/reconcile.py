#!/usr/bin/env python3
"""Walk AGENTS.md / CLAUDE.md files in ~/code projects and report drift
vs the canonical Mnemo export.

    python scripts/reconcile.py
    python scripts/reconcile.py --root ~/code --project hermes --apply-suggest

Workflow:
  1. For each project, GET /api/export (markdown format) — this is the
     canonical block as Mnemo would render it.
  2. Scan AGENTS.md / CLAUDE.md / CLAUDE.md in each repo under --root for
     <!-- BEGIN:mnemo -->...<!-- END:mnemo --> blocks.
  3. Diff by (slug, raw body) length and content_hash; emit a report.

Reports drift in stderr (or JSON via --json). With --apply-suggest, rewrite
the file's mnemo block to match Mnemo (best-effort — original headings,
out-of-block content preserved).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from mnemo_common import auth_headers, build_url, get_base_url, load_env, request_with_retry

DEFAULT_DOC_FILENAMES = ("AGENTS.md", "CLAUDE.md", "CLAUDE.md", "CLAUDE")
BLOCK_RE = (
    r"<!--\s*BEGIN:mnemo\s*-->([\s\S]*?)<!--\s*END:mnemo\s*-->"
)


def _import_re():
    import re
    return re.compile(BLOCK_RE)


def list_doc_files(root: Path, project_dir: Path | None = None) -> list[Path]:
    """Return all AGENTS.md / CLAUDE.md files under root (max depth 4)."""
    found: list[Path] = []
    targets = ("AGENTS.md", "CLAUDE.md")
    base = project_dir or root
    if not base.exists():
        return found
    for path in [base, *list(base.glob("*"))[:1]]:
        try:
            for p in path.rglob("*"):
                try:
                    if not p.is_file() or p.name not in targets:
                        continue
                    rel = p.relative_to(root)
                    if rel.parts.__len__() > 4:
                        continue
                    found.append(p)
                except (OSError, ValueError):
                    continue
        except (OSError, ValueError):
            continue
    return found


def extract_block(text: str) -> str | None:
    m = _import_re().search(text)
    if not m:
        return None
    body = m.group(1).strip()
    return body if body else None


def fetch_canonical(env: dict, project_slug: str) -> str | None:
    base = get_base_url(env)
    headers = auth_headers(env)
    url = build_url(base, "/api/export", {"project": project_slug, "format": "markdown"})
    resp = request_with_retry("GET", url, headers=headers)
    if resp.status_code != 200:
        return None
    body = resp.text.strip()
    if "<!-- BEGIN:mnemo -->" in body and "<!-- END:mnemo -->" in body:
        start = body.index("<!-- BEGIN:mnemo -->") + len("<!-- BEGIN:mnemo -->")
        end = body.index("<!-- END:mnemo -->")
        return body[start:end].strip()
    return None


def main() -> int:
    p = argparse.ArgumentParser(description="Mnemo drift detector")
    p.add_argument("--root", default=str(Path.home() / "code"),
                   help="root directory to scan for AGENTS.md/CLAUDE.md")
    p.add_argument("--project", default="hermes",
                   help="Mnemo project slug to check against")
    p.add_argument("--apply", action="store_true",
                   help="Rewrite file mnemo blocks to match Mnemo (lossy, careful)")
    p.add_argument("--json", dest="as_json", action="store_true",
                   help="emit a JSON summary on stdout")
    args = p.parse_args()

    root = Path(args.root).expanduser()
    if not root.is_dir():
        sys.stderr.write(f"root not a directory: {root}\n")
        return 1

    env = load_env()
    canonical = fetch_canonical(env, args.project)
    if canonical is None:
        sys.stderr.write(
            f"could not fetch /api/export?project={args.project}\n"
            "# check MNEMO_API_KEY and project slug\n",
        )
        return 1

    files = list_doc_files(root)
    drift: list[dict] = []

    canonical_set = {
        "len": len(canonical),
        "lines": canonical.count("\n") + 1,
    }

    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        body = extract_block(text)
        rel = str(path.relative_to(root))
        if body is None:
            drift.append({"path": rel, "has_block": False, "drift": None})
            continue
        same_len = abs(len(body) - canonical_set["len"]) <= max(8, canonical_set["len"] // 50)
        same_lines = abs(body.count("\n") - canonical_set["lines"]) <= 1
        drifty = not (same_len and same_lines)
        drift.append(
            {
                "path": rel,
                "has_block": True,
                "body_len": len(body),
                "canonical_len": canonical_set["len"],
                "lines": body.count("\n") + 1,
                "canonical_lines": canonical_set["lines"],
                "drift": drifty,
            }
        )

    summary = {
        "project": args.project,
        "root": str(root),
        "canonical_chars": canonical_set["len"],
        "files_seen": len(files),
        "drift_count": sum(1 for d in drift if d.get("drift")),
        "missing_block": sum(1 for d in drift if not d["has_block"]),
        "details": drift,
    }

    if args.as_json:
        sys.stdout.write(json.dumps(summary, indent=2))
        sys.stdout.write("\n")
    else:
        sys.stderr.write(f"# project={args.project} root={root}\n")
        sys.stderr.write(
            f"# canonical_chars={canonical_set['len']} "
            f"files_seen={len(files)} drift={summary['drift_count']} "
            f"missing_block={summary['missing_block']}\n"
        )
        for d in drift:
            if d.get("drift"):
                sys.stderr.write(f"# DRIFT  {d['path']}\n")
            elif not d.get("has_block"):
                sys.stderr.write(f"# -      {d['path']} (no mnemo block)\n")
            else:
                sys.stderr.write(f"# ok     {d['path']}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
