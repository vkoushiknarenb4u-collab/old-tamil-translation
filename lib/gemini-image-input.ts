import type { GoogleGenAI } from "@google/genai";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PreparedImage } from "@/lib/image-preprocessing";

type InlineImage = { type: "image"; data: string; mime_type: string };
type UriImage = { type: "image"; uri: string; mime_type: string };
export type GeminiImagePart = InlineImage | UriImage;

export async function createGeminiImageGroups(ai: GoogleGenAI, images: PreparedImage[]): Promise<{ groups: GeminiImagePart[][]; cleanup: () => Promise<void> }> {
  const totalBytes = images.reduce((sum, image) => sum + image.original.length + image.enhancedJpeg.length, 0);
  const estimatedBase64Payload = 4 * Math.ceil(totalBytes / 3);
  // Keep room for prompt and JSON framing under Gemini's 20 MB inline request limit.
  if (estimatedBase64Payload <= 17 * 1024 * 1024) {
    return {
      groups: images.map((image) => [
        { type: "image", data: image.original.toString("base64"), mime_type: image.originalMimeType },
        { type: "image", data: image.enhancedJpeg.toString("base64"), mime_type: "image/jpeg" },
      ]),
      cleanup: async () => undefined,
    };
  }

  const directory = await mkdtemp(join(tmpdir(), "cholascript-upload-"));
  const files = images.flatMap((image, index) => {
    const originalExtension = image.originalMimeType === "image/png" ? "png" : image.originalMimeType === "image/webp" ? "webp" : "jpg";
    return [
      { path: join(directory, `image-${index}-original.${originalExtension}`), bytes: image.original, mimeType: image.originalMimeType, displayName: `CholaScript evidence ${index + 1}` },
      { path: join(directory, `image-${index}-enhanced.jpg`), bytes: image.enhancedJpeg, mimeType: "image/jpeg" as const, displayName: `CholaScript contrast copy ${index + 1}` },
    ];
  });
  const uploaded: string[] = [];
  const cleanup = async () => {
    await Promise.all(uploaded.map(async (name) => { await ai.files.delete({ name }).catch(() => undefined); }));
    await Promise.all(files.map(({ path }) => unlink(path).catch(() => undefined)));
    await rmdir(directory).catch(() => undefined);
  };

  try {
    await Promise.all(files.map(({ path, bytes }) => writeFile(path, bytes)));
    const groups: GeminiImagePart[][] = [];
    for (let index = 0; index < files.length; index += 2) {
      const originalFile = await ai.files.upload({ file: files[index].path, config: { displayName: files[index].displayName, mimeType: files[index].mimeType } });
      if (originalFile.name) uploaded.push(originalFile.name);
      const enhancedFile = await ai.files.upload({ file: files[index + 1].path, config: { displayName: files[index + 1].displayName, mimeType: files[index + 1].mimeType } });
      if (enhancedFile.name) uploaded.push(enhancedFile.name);
      if (!originalFile.uri || !enhancedFile.uri) throw new Error("Gemini did not return image file URIs.");
      groups.push([
        { type: "image", uri: originalFile.uri, mime_type: files[index].mimeType },
        { type: "image", uri: enhancedFile.uri, mime_type: files[index + 1].mimeType },
      ]);
    }
    return {
      groups,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
