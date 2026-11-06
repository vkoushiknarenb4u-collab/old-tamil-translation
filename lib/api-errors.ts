export type ApiErrorCode = "invalid_upload" | "rate_limited" | "not_configured" | "upstream_timeout" | "upstream_rate_limited" | "upstream_error" | "invalid_model_response" | "storage_error" | "unauthorized";

export function classifyGeminiError(error: unknown): { code: ApiErrorCode; status: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const directStatus = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 0;
  const statusMatch = message.match(/\b(400|401|403|408|429|500|502|503|504)\b/);
  const status = [400, 401, 403, 408, 429, 500, 502, 503, 504].includes(directStatus) ? directStatus : statusMatch ? Number(statusMatch[1]) : 0;
  if (/timeout|timed out|abort/i.test(message)) return { code: "upstream_timeout", status: 504, message: "Gemini took too long to respond. Please try again." };
  if (/fetch failed|network|econn|enotfound|eai_again/i.test(message)) return { code: "upstream_error", status: 502, message: "The server could not reach Gemini. Check its internet access and try again." };
  if (status === 429 || /rate limit|resource exhausted/i.test(message)) return { code: "upstream_rate_limited", status: 429, message: "Gemini is busy. Please wait a moment and retry." };
  if (status === 400) return { code: "upstream_error", status: 502, message: "Gemini rejected the model request. Check the configured model and response schema." };
  if (status === 401 || status === 403) return { code: "not_configured", status: 503, message: "Gemini could not authorize this request. Check the server API key and project access." };
  if (status >= 500) return { code: "upstream_error", status: 502, message: "Gemini is temporarily unavailable. Please retry shortly." };
  return { code: "upstream_error", status: 502, message: "Gemini could not complete the reading. Retry, or select a detail area and analyze again." };
}
