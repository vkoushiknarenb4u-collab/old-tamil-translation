import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { analysisSchema } from "@/lib/analysis-schema";
import { saveReferenceAsset } from "@/lib/dataset-repository";
import { getSupabase, hasDatabaseConfig } from "@/lib/supabase";
import { InvalidMultipartFormError, readFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/limited-form-data";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: { code: "unauthorized", message: "Enter the configured administrator token." } }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: { code: "not_configured", message: "Supabase is not configured." } }, { status: 503 });
  try {
    const form = await readFormDataWithinLimit(request, 20 * 1024 * 1024 + 128 * 1024);
    const image = form.get("image");
    const resultText = form.get("result");
    if (!(image instanceof File) || image.size < 1 || image.size > 20 * 1024 * 1024 || typeof resultText !== "string") {
      return NextResponse.json({ error: { code: "invalid_request", message: "Provide an inscription image and its corrected transcription data." } }, { status: 400 });
    }
    let value: unknown;
    try { value = JSON.parse(resultText); } catch { return NextResponse.json({ error: { code: "invalid_request", message: "Transcription data must be valid JSON." } }, { status: 400 }); }
    const result = analysisSchema.extend({ verification_status: z.enum(["unverified", "verified"]) }).safeParse(value);
    if (!result.success) return NextResponse.json({ error: { code: "invalid_request", message: "The record does not match the inscription output fields." } }, { status: 400 });
    const identifier = String(form.get("identifier") || "").trim().slice(0, 160) || null;
    const status = result.data.verification_status === "verified" ? "verified" : "unverified";
    const db = getSupabase();
    const asset = await saveReferenceAsset(db, {
      fileName: image.name, contentType: image.type || "application/octet-stream", bytes: Buffer.from(await image.arrayBuffer()),
      assetType: "inscription", sourceTitle: identifier || image.name,
    });
    const { data, error } = await db.from("inscriptions").insert({
      reference_asset_id: asset.id, identifier, ...result.data, verification_status: status,
      verified_by: status === "verified" ? "administrator" : null,
      verified_at: status === "verified" ? new Date().toISOString() : null,
      correction_history: [{ action: "created", by: "administrator", at: new Date().toISOString(), status }],
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ inscription: data }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: { code: "invalid_upload", message: "The inscription archive upload is over the 20 MB limit." } }, { status: 413 });
    if (error instanceof InvalidMultipartFormError) return NextResponse.json({ error: { code: "invalid_upload", message: error.message } }, { status: 400 });
    return NextResponse.json({ error: { code: "storage_error", message: "The inscription record could not be saved." } }, { status: 500 });
  }
}
