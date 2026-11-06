import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { getSupabase, hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

const sourceSchema = z.object({
  title: z.string().trim().min(2).max(240),
  url: z.string().trim().url().refine((value) => new URL(value).protocol === "https:", "Use a secure HTTPS source URL."),
  summary: z.string().trim().max(2000).nullable().optional(),
  is_verified: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: { code: "unauthorized", message: "Enter the configured administrator token." } }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: { code: "not_configured", message: "Supabase is not configured." } }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "invalid_request", message: "Source data must be valid JSON." } }, { status: 400 }); }
  const parsed = sourceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "Enter a source title and a valid URL." } }, { status: 400 });
  const data = parsed.data;
  const { data: source, error } = await getSupabase().from("historical_sources").insert({
    ...data,
    verified_by: data.is_verified ? "administrator" : null,
    verified_at: data.is_verified ? new Date().toISOString() : null,
  }).select().single();
  if (error) return NextResponse.json({ error: { code: "storage_error", message: "The source could not be saved. Check whether the URL is already in the collection." } }, { status: 500 });
  return NextResponse.json({ source }, { status: 201 });
}
