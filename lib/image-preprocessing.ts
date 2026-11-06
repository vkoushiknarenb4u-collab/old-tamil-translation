import sharp, { type Metadata } from "sharp";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type PreparedImage = {
  original: Buffer;
  originalMimeType: "image/jpeg" | "image/png" | "image/webp";
  enhancedJpeg: Buffer;
  width: number;
  height: number;
};

export async function prepareInscriptionImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new ImageInputError("unsupported_type", "Choose a JPG, PNG, or WebP image.");
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ImageInputError("invalid_size", "The image must be between 1 byte and 12 MB.");
  }

  const original = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(original, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new ImageInputError("invalid_image", "The file contents are not a supported image.");
  }
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new ImageInputError("invalid_image", "The file contents are not a supported image.");
  }
  if (!metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000) {
    throw new ImageInputError("invalid_dimensions", "Image dimensions are missing or exceed 12,000 pixels per side.");
  }

  // Keep original bytes untouched. Gemini receives both the evidence image and this
  // contrast-balanced working copy, which is derived only for readability.
  const enhancedJpeg = await sharp(original, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .normalize()
    .sharpen({ sigma: 1.0 })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const originalMimeType = metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : "image/jpeg";
  return {
    original,
    originalMimeType,
    enhancedJpeg,
    width: metadata.width,
    height: metadata.height,
  };
}

export class ImageInputError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ImageInputError";
  }
}
