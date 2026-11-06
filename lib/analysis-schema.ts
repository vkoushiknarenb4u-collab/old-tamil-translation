import { z } from "zod";

const nullableText = z.string().nullable();

export const analysisSchema = z.object({
  original_transcription: z.string(),
  transliteration: z.string(),
  modern_tamil: z.string(),
  english_translation: z.string(),
  historical_explanation_tamil: z.string(),
  historical_explanation_english: z.string(),
  king: nullableText,
  temple: nullableText,
  approximate_period: nullableText,
  uncertain_segments: z.array(z.string()),
  source_references: z.array(z.object({ title: z.string(), url: z.string() })),
  verification_status: z.literal("unverified"),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;

export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    original_transcription: { type: "string", description: "Best-effort original script transcription. Put [unclear] where evidence cannot be read." },
    transliteration: { type: "string", description: "Roman transliteration of only the readable transcription." },
    modern_tamil: { type: "string", description: "A readable modern Tamil rendering. Do not add details absent from the source." },
    english_translation: { type: "string", description: "An English translation, preserving uncertainty." },
    historical_explanation_tamil: { type: "string", description: "Brief context in Tamil; distinguish inscription evidence from interpretation." },
    historical_explanation_english: { type: "string", description: "Brief context in English; distinguish inscription evidence from interpretation." },
    king: { type: ["string", "null"], description: "Only a name evidenced by the visible text or supplied sources; otherwise null." },
    temple: { type: ["string", "null"], description: "Only a place evidenced by the visible text or supplied sources; otherwise null." },
    approximate_period: { type: ["string", "null"], description: "Only when supported by visible script features or supplied sources; otherwise null." },
    uncertain_segments: { type: "array", items: { type: "string" }, description: "Short quoted spans and why each is uncertain." },
    source_references: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, url: { type: "string" } }, required: ["title", "url"] }, description: "Only cite sources included in supplied verified references; otherwise empty." },
    verification_status: { type: "string", enum: ["unverified"] },
  },
  required: [
    "original_transcription", "transliteration", "modern_tamil", "english_translation",
    "historical_explanation_tamil", "historical_explanation_english", "king", "temple",
    "approximate_period", "uncertain_segments", "source_references", "verification_status",
  ],
} as const;

export function validateAnalysis(value: unknown): AnalysisResult {
  return analysisSchema.parse(value);
}

export function normalizeReferences(result: AnalysisResult, allowed: Array<{ title: string; url: string }>): AnalysisResult {
  const allowedKeys = new Set(allowed.map((item) => `${item.title}\n${item.url}`));
  return {
    ...result,
    source_references: result.source_references.filter((item) => allowedKeys.has(`${item.title}\n${item.url}`)),
    verification_status: "unverified",
  };
}
