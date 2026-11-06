import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { saveReferenceAsset } from "@/lib/dataset-repository";
import { indexVerifiedReference } from "@/lib/gemini-file-search";
import { InvalidMultipartFormError, readFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/limited-form-data";
import { getSupabase, hasDatabaseConfig, storageBucket } from "@/lib/supabase";

export const runtime = "nodejs";

const uploadSchema = z.object({
  assetType: z.enum(["chart", "chart_crop", "inscription", "document"]),
  sourceTitle: z.string().trim().min(2).max(240),
  sourceUrl: z.string().trim().url().refine((value) => new URL(value).protocol === "https:", "Use a secure HTTPS source URL.").nullable().optional(),
  periodLabel: z.string().trim().max(120).nullable().optional(),
  parentAssetId: z.string().uuid().nullable().optional(),
  isVerifiedSource: z.boolean().default(false),
  crop: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() }).nullable().optional(),
});

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: { code: "unauthorized", message: "Enter the configured administrator token." } }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: { code: "not_configured", message: "Supabase is not configured." } }, { status: 503 });
  const db = getSupabase();
  const [assets, labels, inscriptions] = await Promise.all([
    db.from("reference_assets").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("character_labels").select("*").order("created_at", { ascending: false }).limit(300),
    db.from("inscriptions").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  const errors = [assets.error, labels.error, inscriptions.error].filter(Boolean);
  if (errors.length) return NextResponse.json({ error: { code: "storage_error", message: "Could not read the dataset. Apply the database migration and check Supabase configuration." } }, { status: 500 });
  const withUrls = await Promise.all((assets.data || []).map(async (asset) => {
    const { data } = await db.storage.from(storageBucket()).createSignedUrl(asset.storage_path, 3600);
    return { ...asset, preview_url: data?.signedUrl || null };
  }));
  const { data: sources, error: sourceError } = await db.from("historical_sources").select("*").order("created_at", { ascending: false }).limit(200);
  if (sourceError) return NextResponse.json({ error: { code: "storage_error", message: "Could not read historical sources. Apply the database migration first." } }, { status: 500 });
  return NextResponse.json({ assets: withUrls, labels: labels.data || [], inscriptions: inscriptions.data || [], sources: sources || [] });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: { code: "unauthorized", message: "Enter the configured administrator token." } }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: { code: "not_configured", message: "Supabase is not configured." } }, { status: 503 });
  try {
    const form = await readFormDataWithinLimit(request, 20 * 1024 * 1024 + 128 * 1024);
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: { code: "invalid_upload", message: "Choose a non-empty source file under 20 MB." } }, { status: 400 });
    }
    const meta = uploadSchema.safeParse({
      assetType: form.get("assetType"), sourceTitle: form.get("sourceTitle"), sourceUrl: form.get("sourceUrl") || null,
      periodLabel: form.get("periodLabel") || null, parentAssetId: form.get("parentAssetId") || null,
      isVerifiedSource: form.get("isVerifiedSource") === "true",
      crop: form.get("crop") ? JSON.parse(String(form.get("crop"))) : null,
    });
    if (!meta.success) return NextResponse.json({ error: { code: "invalid_request", message: "Check the source title, type, URL, and crop metadata." } }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const saved = await saveReferenceAsset(getSupabase(), {
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      bytes,
      ...meta.data,
    });
    let fileSearchWarning: string | null = null;
    if (meta.data.isVerifiedSource && process.env.GEMINI_FILE_SEARCH_STORE_ID) {
      try {
        const geminiFileName = await indexVerifiedReference({
          bytes, fileName: file.name, contentType: file.type || "application/octet-stream",
          title: meta.data.sourceTitle, url: meta.data.sourceUrl, period: meta.data.periodLabel,
        });
        if (geminiFileName) {
          const { error } = await getSupabase().from("reference_assets").update({ gemini_file_name: geminiFileName }).eq("id", saved.id);
          if (error) fileSearchWarning = "Stored in Supabase, but its Gemini File Search status could not be recorded.";
        }
      } catch {
        fileSearchWarning = "Stored in Supabase, but Gemini File Search indexing failed. Check the configured store and retry indexing later.";
      }
    }
    return NextResponse.json({ asset: saved, fileSearchWarning }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: { code: "invalid_upload", message: "The source upload is over the 20 MB limit." } }, { status: 413 });
    if (error instanceof InvalidMultipartFormError) return NextResponse.json({ error: { code: "invalid_upload", message: error.message } }, { status: 400 });
    return NextResponse.json({ error: { code: "storage_error", message: "The source file could not be stored." } }, { status: 500 });
  }
}
