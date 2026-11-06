import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageInputError, MAX_UPLOAD_BYTES, prepareInscriptionImage } from "@/lib/image-preprocessing";

async function onePixelPng() {
  return sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 130, g: 120, b: 90 } } }).png().toBuffer();
}

describe("inscription image upload", () => {
  it("rejects unsupported media types", async () => {
    const file = new File([await onePixelPng()], "chart.gif", { type: "image/gif" });
    await expect(prepareInscriptionImage(file)).rejects.toMatchObject({ code: "unsupported_type" });
  });

  it("rejects oversized uploads before image processing", async () => {
    const bytes = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    const file = new File([bytes], "large.png", { type: "image/png" });
    await expect(prepareInscriptionImage(file)).rejects.toMatchObject({ code: "invalid_size" });
  });

  it("preserves original bytes and produces a separate normalized working image", async () => {
    const original = await onePixelPng();
    const file = new File([original], "stone.png", { type: "image/png" });
    const prepared = await prepareInscriptionImage(file);
    expect(prepared.original.equals(original)).toBe(true);
    expect(prepared.originalMimeType).toBe("image/png");
    expect(prepared.enhancedJpeg.equals(original)).toBe(false);
    expect(prepared.width).toBe(1);
    expect(prepared.height).toBe(1);
  });

  it("rejects a supported MIME label when the file contents are not an image", async () => {
    const file = new File(["not an image"], "stone.jpg", { type: "image/jpeg" });
    await expect(prepareInscriptionImage(file)).rejects.toBeInstanceOf(ImageInputError);
  });
});
