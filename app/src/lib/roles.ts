/**
 * Server-side authorization for demo controls.
 *
 * Persona switching in the UI changes language and emphasis only. It never
 * grants a privilege. Injecting a scenario, pausing, changing speed, changing
 * Analyst mode and resetting all require the demo administrator role, checked
 * here on the server for every request.
 */

import { NextRequest } from "next/server";
import { demoConfig } from "./env";
import { getOrCreateAppUserId } from "./appUser";

export type Role = "viewer" | "presenter" | "demo_administrator";

export interface Actor {
  actorId: string;
  role: Role;
  setCookie: boolean;
}

const ADMIN_HEADER = "x-demo-admin-token";
const ADMIN_COOKIE = "demo_admin_token";

/** True when the deployment runs without an administrator token (laptop demo). */
export function isOpenDemo(): boolean {
  return demoConfig.adminToken.length === 0;
}

export function resolveActor(req: NextRequest): Actor {
  const { appUserId, setCookie } = getOrCreateAppUserId(req);
  const presented =
    req.headers.get(ADMIN_HEADER) || req.cookies.get(ADMIN_COOKIE)?.value || "";
  const role: Role = isOpenDemo()
    ? "demo_administrator"
    : presented && presented === demoConfig.adminToken
      ? "demo_administrator"
      : demoConfig.defaultRole === "viewer"
        ? "viewer"
        : "presenter";
  return { actorId: appUserId, role, setCookie };
}

export function isAdministrator(actor: Actor): boolean {
  return actor.role === "demo_administrator";
}
