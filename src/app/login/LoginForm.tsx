"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/login/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<
    { error?: string } | undefined,
    FormData
  >(loginAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-4 max-w-sm">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">API Key</span>
        <input
          type="password"
          name="key"
          required
          autoFocus
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
        />
      </label>
      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        Log in
      </button>
    </form>
  );
}