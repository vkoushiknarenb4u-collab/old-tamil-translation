import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { analysisJsonSchema, normalizeReferences, validateAnalysis } from "@/lib/analysis-schema";
import { classifyGeminiError } from "@/lib/api-errors";
import { ImageInputError, prepareInscriptionImage } from "@/lib/image-preprocessing";
import { fileSearchCitationSources } from "@/lib/gemini-file-search";
import { createGeminiImageGroups } from "@/lib/gemini-image-input";
import { InvalidMultipartFormError, readFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/limited-form-data";
import { getSupabase, hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 180;

type CitationSource = { title: string; url: string; summary?: string | null };

async function loadVerifiedContext() {
  if (!hasDatabaseConfig()) return { labels: [] as Array<Record<string, unknown>>, sources: [] as CitationSource[], error: null as string | null };
  try {
    const db = getSupabase();
    const [labelRows, sourceRows] = await Promise.all([
      db.from("character_labels").select("character_text,script_variant,period_label,notes,asset_id").eq("is_verified", true).limit(100),
      db.from("historical_sources").select("title,url,summary").eq("is_verified", true).limit(30),
    ]);
    if (labelRows.error) throw labelRows.error;
    if (sourceRows.error) throw sourceRows.error;
    const sources = ((sourceRows.data || []) as CitationSource[]).filter((source) => {
      try { return new URL(source.url).protocol === "https:"; } catch { return false; }
    });
    return { labels: labelRows.data || [], sources, error: null };
  } catch {
    return { labels: [] as Array<Record<string, unknown>>, sources: [] as CitationSource[], error: "Reference database could not be read. Check that the migration has been applied." };
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: { code: "not_configured", message: "Add GEMINI_API_KEY to the server environment, then restart the app." } }, { status: 503 });
  }

  try {
    const form = await readFormDataWithinLimit(request, 24 * 1024 * 1024 + 256 * 1024);
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { code: "invalid_upload", message: "Choose an inscription image to analyze." } }, { status: 400 });
    }
    const focusFile = form.get("focus");
    if (focusFile !== null && !(focusFile instanceof File)) {
      return NextResponse.json({ error: { code: "invalid_upload", message: "The selected detail crop is invalid. Please select it again." } }, { status: 400 });
    }

    const prepared = await prepareInscriptionImage(file);
    const preparedFocus = focusFile instanceof File ? await prepareInscriptionImage(focusFile) : null;
    const context = await loadVerifiedContext();
    const refs = context.sources.map(({ title, url }) => ({ title, url }));
    const prompt = [
      "You are an assistant for careful reading of historical Tamil inscriptions.",
      "Read the supplied photograph as inscription evidence. The first image is the untouched original and the second is its contrast-normalized working copy; always compare them.",
      preparedFocus ? "After the full-image pair, a user-selected detail crop and its contrast-normalized copy follow. Use them as a visual zoom while keeping the full original image as context. Only revise unclear readings where the crop visibly resolves the letters." : "",
      "The attached/reference materials are aids only. Never treat an alphabet chart as a transcription or as proof of a particular reading.",
      "Use [unclear] in the original transcription wherever letters cannot be read confidently, and list those spans in uncertain_segments. Do not silently guess.",
      "Do not infer Raja Raja Chola, a temple, date, regnal year, inscription number, or historical event from the project theme. Use null when the supplied image and references do not support an identification.",
      "Keep the modern Tamil and English renditions faithful to the transcription; mark interpretive uncertainty. Do not claim an inscription is verified.",
      "Only cite the supplied verified sources by exact title and URL. If no source supports a statement, leave source_references empty.",
      "If Gemini File Search returns a citation, use its exact source title and HTTPS URL metadata. The store is populated only from files an administrator verified.",
      "Return all required JSON fields. verification_status must remain unverified.",
      `Verified character-label reference records (may be empty): ${JSON.stringify(context.labels)}`,
      `Verified bibliographic source records allowed for citations (may be empty): ${JSON.stringify(refs)}`,
    ].join("\n\n");

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const imageGroups = await createGeminiImageGroups(ai, preparedFocus ? [prepared, preparedFocus] : [prepared]);
    const imageInput = [{ type: "text" as const, text: prompt }, ...imageGroups.groups.flat()];
    const tools = process.env.GEMINI_FILE_SEARCH_STORE_ID
      ? [{ type: "file_search" as const, file_search_store_names: [process.env.GEMINI_FILE_SEARCH_STORE_ID] }]
      : undefined;

    let interaction;
    try {
      interaction = await ai.interactions.create({
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        input: imageInput,
        ...(tools ? { tools } : {}),
        response_format: { type: "text", mime_type: "application/json", schema: analysisJsonSchema },
        generation_config: { thinking_level: "low", max_output_tokens: 2048 },
        store: false,
      }, { timeout_ms: 165_000, retries: { strategy: "none" } });
    } finally { await imageGroups.cleanup(); }
    const raw = interaction.output_text;
    if (!raw) throw new Error("Gemini returned an empty response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: { code: "invalid_model_response", message: "Gemini returned malformed structured data. Please retry." } }, { status: 502 });
    }
    let result;
    try {
      result = normalizeReferences(validateAnalysis(parsed), [...refs, ...fileSearchCitationSources(interaction)]);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ error: { code: "invalid_model_response", message: "Gemini's response did not match the required inscription schema. Please retry." } }, { status: 502 });
      }
      throw error;
    }

    return NextResponse.json({
      result,
      image: { width: prepared.width, height: prepared.height, originalPreserved: true, enhancedCopySent: true, focusUsed: Boolean(preparedFocus) },
      references: { verifiedLabelsUsed: context.labels.length, verifiedSourcesAvailable: refs.length + fileSearchCitationSources(interaction).length, warning: context.error },
    });
  } catch (error) {
    if (error instanceof ImageInputError) {
      return NextResponse.json({ error: { code: "invalid_upload", message: error.message } }, { status: 400 });
    }
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: { code: "invalid_upload", message: "The combined image upload is over the 24 MB limit." } }, { status: 413 });
    if (error instanceof InvalidMultipartFormError) return NextResponse.json({ error: { code: "invalid_upload", message: error.message } }, { status: 400 });
    const classified = classifyGeminiError(error);
    return NextResponse.json({ error: { code: classified.code, message: classified.message } }, { status: classified.status });
  }
}
