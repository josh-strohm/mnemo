#!/usr/bin/env python3
"""Shared helpers for Mnemo client scripts.

Loads config from ~/code/mnemo/.env with a fallback to ~/.hermes/.env
(fixing the single-path bug that the original session_export.py had),
provides Bearer-authenticated requests with retry on 5xx.
"""
from __future__ import annotations

import os
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any

try:
    import requests  # type: ignore
except ImportError:  # pragma: no cover
    sys.stderr.write("This script needs the 'requests' package: pip install requests\n")
    raise

ENV_PATHS = (
    Path.home() / "code" / "mnemo" / ".env",
    Path.home() / ".hermes" / ".env",
)

DEFAULT_BASE_URL = "https://mnemo.joshstrohm.me"
MAX_RETRIES = 2  # 2 retries = up to 3 attempts
BACKOFF_SECONDS = 1.0


def _load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        values[key] = val
    return values


def load_env() -> dict[str, str]:
    """Load env from the first MNEMO-bearing file, falling back to the next."""
    merged: dict[str, str] = {}
    for path in ENV_PATHS:
        merged.update({k: v for k, v in _load_dotenv(path).items() if k not in merged})
    # Also layer in real process env (highest precedence for overrides).
    for key in ("MNEMO_BASE_URL", "MNEMO_API_KEY", "OPENAI_API_KEY", "DATABASE_URL"):
        if os.environ.get(key):
            merged[key] = os.environ[key]
    return merged


def get_base_url(env: dict[str, str] | None = None) -> str:
    env = env or load_env()
    return (env.get("MNEMO_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def get_api_key(env: dict[str, str] | None = None) -> str:
    env = env or load_env()
    return env.get("MNEMO_API_KEY") or ""


def auth_headers(env: dict[str, str] | None = None) -> dict[str, str]:
    key = get_api_key(env)
    headers = {"Accept": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def request_with_retry(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> requests.Response:
    """Make an HTTP request, retrying 5xx up to MAX_RETRIES with backoff."""
    last: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.request(
                method,
                url,
                headers=headers,
                params=params,
                json=json_body,
                timeout=timeout,
            )
            if resp.status_code in (500, 502, 503) and attempt < MAX_RETRIES:
                sys.stderr.write(
                    f"[retry] {resp.status_code} on {method} {url}; "
                    f"retry {attempt + 1}/{MAX_RETRIES} in {BACKOFF_SECONDS}s\n"
                )
                time.sleep(BACKOFF_SECONDS)
                continue
            return resp
        except requests.RequestException as exc:
            last = exc
            if attempt < MAX_RETRIES:
                sys.stderr.write(
                    f"[retry] {exc} on {method} {url}; "
                    f"retry {attempt + 1}/{MAX_RETRIES} in {BACKOFF_SECONDS}s\n"
                )
                time.sleep(BACKOFF_SECONDS)
                continue
            raise
    # Should not reach here, but satisfy the type checker.
    raise last  # type: ignore[misc]


def build_url(base: str, path: str, params: dict[str, Any] | None = None) -> str:
    if params:
        qs = urllib.parse.urlencode(
            {k: v for k, v in params.items() if v is not None and v != ""}
        )
        return f"{base}{path}?{qs}" if qs else f"{base}{path}"
    return f"{base}{path}"