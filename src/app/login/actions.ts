"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "mnemo-auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const apiKey = process.env.MNEMO_API_KEY;
  if (!apiKey) {
    return { error: "Authentication is not configured on the server." };
  }

  const submitted = formData.get("key");
  if (typeof submitted !== "string" || submitted !== apiKey) {
    return { error: "Invalid API key." };
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, submitted, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/memories");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}