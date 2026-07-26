/**
 * Request identity, JSON helpers, and safe error shaping for the API layer.
 */

import { NextRequest, NextResponse } from "next/server";
import { redact } from "./env";

export const REQUEST_ID_HEADER = "x-demo-request-id";

export function requestId(req: NextRequest): string {
  return req.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID();
}

export function ok<T>(req: NextRequest, body: T, init: ResponseInit = {}): NextResponse {
  const id = requestId(req);
  return NextResponse.json(
    { ...(body as object), request_id: id },
    { ...init, headers: { ...(init.headers || {}), [REQUEST_ID_HEADER]: id } }
  );
}

export function fail(
  req: NextRequest,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {}
): NextResponse {
  const id = requestId(req);
  return NextResponse.json(
    { error: { code, message: redact(message), ...extra }, request_id: id },
    { status, headers: { [REQUEST_ID_HEADER]: id } }
  );
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return redact(error.message);
  return "Unexpected error";
}

/**
 * Rejects cross-origin state changes. Browsers send Origin on same-origin
 * POSTs from this app, so a mismatch means the request did not come from the
 * demo UI.
 */
export function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function clampString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}
