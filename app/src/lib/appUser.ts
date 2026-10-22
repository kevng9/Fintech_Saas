/**
 * Demo identity. A first-party, HTTP-only cookie identifies the browser so
 * Analyst sessions, caches and audit records can be partitioned per user.
 * A hosted deployment puts real authentication in front of this app; this
 * cookie is never a substitute for it.
 */

import { NextRequest, NextResponse } from "next/server";

const COOKIE = "demo_uid";
const TAB_HEADER = "x-demo-tab-id";

export function getOrCreateAppUserId(req: NextRequest): {
  appUserId: string;
  setCookie: boolean;
} {
  const existing = req.cookies.get(COOKIE)?.value;
  if (existing) return { appUserId: existing, setCookie: false };
  return { appUserId: `u-${crypto.randomUUID()}`, setCookie: true };
}

export function applyAppUserCookie(res: NextResponse, setCookie: boolean, appUserId?: string) {
  if (setCookie && appUserId) {
    res.cookies.set(COOKIE, appUserId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }
  return res;
}

export function tabId(req: NextRequest): string {
  return req.headers.get(TAB_HEADER)?.slice(0, 64) || "default-tab";
}
