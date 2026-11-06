import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase, hasDatabaseConfig } from "@/lib/supabase";

const feedbackSchema = z.object({
  category: z.enum(["reading", "translation", "context", "other"]),
  message: z.string().trim().min(3).max(2000),
  transcription: z.string().max(2000).optional(),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!hasDatabaseConfig()) return NextResponse.json({ error: { code: "not_configured", message: "Feedback storage is not configured yet." } }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "invalid_request", message: "Feedback must be valid JSON." } }, { status: 400 }); }
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "Add a short feedback note before sending." } }, { status: 400 });
  const { error } = await getSupabase().from("analysis_feedback").insert({
    category: parsed.data.category,
    message: parsed.data.message,
    transcription_excerpt: parsed.data.transcription || null,
  });
  if (error) return NextResponse.json({ error: { code: "storage_error", message: "Feedback could not be saved." } }, { status: 500 });
  return NextResponse.json({ ok: true });
}
