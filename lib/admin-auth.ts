import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

export function isAdminRequest(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const provided = request.headers.get("x-admin-token") || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
