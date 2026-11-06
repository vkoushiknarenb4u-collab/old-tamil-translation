import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { analysisSchema } from "@/lib/analysis-schema";
import { getSupabase, hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

const correctedSchema = analysisSchema.extend({ verification_status: z.enum(["unverified", "verified"]) });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: { code: "unauthorized", message: "Enter the configured administrator token." } }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: { code: "not_configured", message: "Supabase is not configured." } }, { status: 503 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: { code: "invalid_request", message: "Invalid inscription record." } }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "invalid_request", message: "Record data must be valid JSON." } }, { status: 400 }); }
  const parsed = correctedSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "The corrected record does not match the expected schema." } }, { status: 400 });

  const db = getSupabase();
  const { data: previous, error: readError } = await db.from("inscriptions").select("*").eq("id", id).single();
  if (readError || !previous) return NextResponse.json({ error: { code: "not_found", message: "Inscription record not found." } }, { status: 404 });
  const now = new Date().toISOString();
  const updated = { ...parsed.data, verified_by: parsed.data.verification_status === "verified" ? "administrator" : null, verified_at: parsed.data.verification_status === "verified" ? now : null, updated_at: now };
  const { error: revisionError } = await db.from("inscription_revisions").insert({
    inscription_id: id,
    previous_record: previous,
    corrected_record: updated,
    editor: "administrator",
    note: "Manual correction and review",
  });
  if (revisionError) return NextResponse.json({ error: { code: "storage_error", message: "The correction history could not be recorded." } }, { status: 500 });
  const { data, error } = await db.from("inscriptions").update(updated).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: { code: "storage_error", message: "The corrected record could not be saved." } }, { status: 500 });
  return NextResponse.json({ inscription: data });
}
