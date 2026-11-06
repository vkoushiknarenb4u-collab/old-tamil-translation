import { describe, expect, it } from "vitest";
import { normalizeReferences, validateAnalysis } from "@/lib/analysis-schema";

const emptyResult = {
  original_transcription: "", transliteration: "", modern_tamil: "", english_translation: "",
  historical_explanation_tamil: "", historical_explanation_english: "", king: null, temple: null,
  approximate_period: null, uncertain_segments: [], source_references: [], verification_status: "unverified",
};

describe("analysis response schema", () => {
  it("accepts the required empty and uncertain-safe output shape", () => {
    expect(validateAnalysis(emptyResult)).toEqual(emptyResult);
  });

  it("rejects missing fields and fabricated verification states", () => {
    expect(() => validateAnalysis({ ...emptyResult, verification_status: "verified" })).toThrow();
    const { temple: _temple, ...missing } = emptyResult;
    expect(() => validateAnalysis(missing)).toThrow();
  });

  it("keeps only exact citations from the supplied source collection", () => {
    const result = validateAnalysis({
      ...emptyResult,
      source_references: [
        { title: "Verified source", url: "https://archive.example/record" },
        { title: "Invented source", url: "https://unknown.example/record" },
      ],
    });
    expect(normalizeReferences(result, [{ title: "Verified source", url: "https://archive.example/record" }]).source_references)
      .toEqual([{ title: "Verified source", url: "https://archive.example/record" }]);
  });
});
