import { GoogleGenAI } from "@google/genai";
import { mkdtemp, unlink, writeFile, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function indexVerifiedReference(input: {
  bytes: Buffer;
  fileName: string;
  contentType: string;
  title: string;
  url?: string | null;
  period?: string | null;
}) {
  const storeName = process.env.GEMINI_FILE_SEARCH_STORE_ID;
  if (!storeName || !process.env.GEMINI_API_KEY) return null;
  const directory = await mkdtemp(join(tmpdir(), "cholascript-reference-"));
  const path = join(directory, "reference.bin");
  try {
    await writeFile(path, input.bytes);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const uploaded = await ai.files.upload({
      file: path,
      config: { displayName: input.title, mimeType: input.contentType },
    });
    if (!uploaded.name) throw new Error("Gemini did not return a file name.");
    let operation = await ai.fileSearchStores.importFile({
      fileSearchStoreName: storeName,
      fileName: uploaded.name,
      config: {
        customMetadata: [
          { key: "source_title", stringValue: input.title },
          ...(input.url ? [{ key: "source_url", stringValue: input.url }] : []),
          ...(input.period ? [{ key: "period", stringValue: input.period }] : []),
        ],
      },
    });
    const deadline = Date.now() + 4 * 60_000;
    while (!operation.done && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      operation = await ai.operations.get({ operation });
    }
    if (!operation.done) throw new Error("Gemini File Search import timed out.");
    return uploaded.name;
  } finally {
    await unlink(path).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  }
}

export function fileSearchCitationSources(interaction: unknown): Array<{ title: string; url: string }> {
  if (!interaction || typeof interaction !== "object") return [];
  const steps = (interaction as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  const found = new Map<string, { title: string; url: string }>();
  for (const step of steps) {
    if (!step || typeof step !== "object" || (step as { type?: string }).type !== "model_output") continue;
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const annotations = (block as { annotations?: unknown }).annotations;
      if (!Array.isArray(annotations)) continue;
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== "object" || (annotation as { type?: string }).type !== "file_citation") continue;
        const metadata = (annotation as { custom_metadata?: unknown; customMetadata?: unknown }).custom_metadata ?? (annotation as { customMetadata?: unknown }).customMetadata;
        if (!Array.isArray(metadata)) continue;
        const fields = new Map<string, string>();
        for (const field of metadata) {
          if (!field || typeof field !== "object") continue;
          const value = (field as { string_value?: unknown; stringValue?: unknown }).string_value ?? (field as { stringValue?: unknown }).stringValue;
          if (typeof value === "string") fields.set(String((field as { key?: unknown }).key), value);
        }
        const title = fields.get("source_title"); const url = fields.get("source_url");
        if (title && url) {
          try {
            const parsed = new URL(url);
            if (parsed.protocol === "https:") found.set(`${title}\n${parsed.href}`, { title, url: parsed.href });
          } catch { /* Do not expose malformed model citations. */ }
        }
      }
    }
  }
  return Array.from(found.values());
}
