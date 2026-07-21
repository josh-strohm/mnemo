"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ApiKeyRow = {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
};

/**
 * /admin/api-keys — Tier 3 per-agent API keys (client island).
 *
 * Wraps `GET /api/api-keys` and `POST /api/api-keys` so admin users can:
 *   - list current keys (no plaintext exposed)
 *   - create a new key — the plaintext token is shown ONCE on creation,
 *     then never retrievable again.
 *   - revoke (soft) or hard-delete via DELETE.
 */
export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState("memory:read,memory:write");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ id: string; token: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const r = await fetch("/api/api-keys", { cache: "no-store" });
      if (!r.ok) {
        setError(`GET /api/api-keys: ${r.status}`);
        return;
      }
      const data = await r.json();
      setKeys(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function createKey() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const scopes = newScopes.split(",").map((s) => s.trim()).filter(Boolean);
      const r = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), scopes }),
      });
      if (!r.ok) {
        const text = await r.text();
        setError(`create failed: ${r.status} ${text}`);
        return;
      }
      const created = await r.json();
      setNewToken({ id: created.id, token: created.token, name: created.name });
      setNewName("");
      void load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string, hard: boolean) {
    const ok = window.confirm(
      hard
        ? "Hard-delete this API key? This is irreversible."
        : "Revoke this API key? You can recreate it later.",
    );
    if (!ok) return;
    const r = await fetch(`/api/api-keys/${id}${hard ? "?hard=true" : ""}`, { method: "DELETE" });
    if (!r.ok) {
      const text = await r.text();
      setError(`${hard ? "hard-delete" : "revoke"} failed: ${r.status} ${text}`);
      return;
    }
    void load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API keys</h1>
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            ← Stats
          </Link>
          <Link
            href="/admin/audit"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Audit log
          </Link>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="text-sm font-medium mb-3">Create API key</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. hermes-compact-cron"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Scopes (csv)</label>
            <input
              type="text"
              value={newScopes}
              onChange={(e) => setNewScopes(e.target.value)}
              placeholder="memory:read,memory:write"
              className="w-72 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            type="button"
            onClick={createKey}
            disabled={creating || !newName.trim()}
            className="rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-3">
          Allowed scopes: admin:read admin:write memory:read memory:write memory:delete project:read
          project:write project:delete search:read context:read export:read import:write backup:read
          audit:read. admin:write implies everything.
        </p>
      </section>

      {newToken && (
        <section className="rounded-lg border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h2 className="text-sm font-medium mb-2">New API key for &ldquo;{newToken.name}&rdquo;</h2>
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
            This token is shown exactly once. Copy it now — you cannot retrieve it later.
          </p>
          <code className="block text-xs font-mono break-all bg-white dark:bg-black p-2 rounded border border-amber-300 dark:border-amber-700">
            {newToken.token}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(newToken.token)}
            className="mt-2 text-xs rounded border border-amber-300 dark:border-amber-700 px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => setNewToken(null)}
            className="mt-2 ml-2 text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1"
          >
            Dismiss
          </button>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="text-sm font-medium mb-3">Existing keys</h2>
        {keys === null ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-zinc-500">No keys yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Scopes</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3">Last used</th>
                <th className="py-2 pr-3">Expires</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr
                  key={k.id}
                  className="border-b border-zinc-100 dark:border-zinc-900 last:border-0 align-top"
                >
                  <td className="py-1.5 pr-3 font-medium">{k.name}</td>
                  <td className="py-1.5 pr-3 text-xs font-mono">
                    {k.scopes.join(", ")}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-zinc-500">
                    {new Date(k.createdAt).toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-zinc-500">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-zinc-500">
                    {k.expiresAt ? new Date(k.expiresAt).toLocaleString() : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">
                    {k.isActive ? (
                      <span className="text-emerald-600 dark:text-emerald-400">active</span>
                    ) : (
                      <span className="text-zinc-500">revoked</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">
                    {k.isActive && (
                      <>
                        <button
                          type="button"
                          onClick={() => revoke(k.id, false)}
                          className="mr-1 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                        >
                          Revoke
                        </button>
                        <button
                          type="button"
                          onClick={() => revoke(k.id, true)}
                          className="rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-2 py-0.5 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          Hard delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
