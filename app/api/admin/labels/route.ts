import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { getSupabase, hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

const labelSchema = z.object({
  asset_id: z.string().uuid(),
  character_text: z.string().trim().min(1).max(50),
  script_variant: z.string().trim().max(120).nullable().optional(),
  period_label: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  is_verified: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: { code: "unauthorized", message: "Enter the configured administrator token." } }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: { code: "not_configured", message: "Supabase is not configured." } }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "invalid_request", message: "Label data must be valid JSON." } }, { status: 400 }); }
  const parsed = labelSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "Enter the character label and metadata." } }, { status: 400 });
  const data = parsed.data;
  const { data: label, error } = await getSupabase().from("character_labels").insert({
    ...data,
    verified_at: data.is_verified ? new Date().toISOString() : null,
    verified_by: data.is_verified ? "administrator" : null,
  }).select().single();
  if (error) return NextResponse.json({ error: { code: "storage_error", message: "The character label could not be saved." } }, { status: 500 });
  return NextResponse.json({ label }, { status: 201 });
}
