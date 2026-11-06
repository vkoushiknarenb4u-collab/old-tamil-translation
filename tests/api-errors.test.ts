import { describe, expect, it } from "vitest";
import { classifyGeminiError } from "@/lib/api-errors";

describe("Gemini API error handling", () => {
  it("maps timeouts to a retryable gateway timeout", () => {
    expect(classifyGeminiError(new Error("request timeout"))).toMatchObject({ code: "upstream_timeout", status: 504 });
  });

  it("maps rate limits to a retryable response", () => {
    expect(classifyGeminiError(new Error("429 resource exhausted"))).toMatchObject({ code: "upstream_rate_limited", status: 429 });
    expect(classifyGeminiError(Object.assign(new Error("quota exhausted"), { status: 429 }))).toMatchObject({ code: "upstream_rate_limited", status: 429 });
  });

  it("does not expose raw provider errors", () => {
    expect(classifyGeminiError(new Error("500 internal stack secret"))).toMatchObject({ code: "upstream_error", status: 502, message: "Gemini is temporarily unavailable. Please retry shortly." });
  });

  it("explains when the server cannot reach Gemini", () => {
    expect(classifyGeminiError(new TypeError("fetch failed"))).toMatchObject({ code: "upstream_error", status: 502, message: "The server could not reach Gemini. Check its internet access and try again." });
  });
});
