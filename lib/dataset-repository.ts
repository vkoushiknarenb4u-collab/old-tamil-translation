import type { SupabaseClient } from "@supabase/supabase-js";
import { storageBucket } from "@/lib/supabase";

export type ReferenceAssetInput = {
  fileName: string;
  contentType: string;
  bytes: Buffer;
  assetType: "chart" | "chart_crop" | "inscription" | "document";
  sourceTitle: string;
  sourceUrl?: string | null;
  periodLabel?: string | null;
  parentAssetId?: string | null;
  crop?: { x: number; y: number; width: number; height: number } | null;
  isVerifiedSource?: boolean;
};

export async function saveReferenceAsset(client: SupabaseClient, input: ReferenceAssetInput) {
  const extension = input.fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const id = crypto.randomUUID();
  const path = `references/${input.assetType}/${id}.${extension}`;
  const { error: uploadError } = await client.storage.from(storageBucket()).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const payload = {
    id,
    asset_type: input.assetType,
    storage_path: path,
    source_title: input.sourceTitle,
    source_url: input.sourceUrl || null,
    period_label: input.periodLabel || null,
    parent_asset_id: input.parentAssetId || null,
    crop: input.crop || null,
    source_metadata: { original_filename: input.fileName, ingested_at: new Date().toISOString() },
    is_verified: input.isVerifiedSource || false,
  };
  const { data, error } = await client.from("reference_assets").insert(payload).select().single();
  if (error) {
    await client.storage.from(storageBucket()).remove([path]);
    throw error;
  }
  return data;
}

export function splitVerifiedDataset<T extends { is_verified: boolean }>(rows: T[]) {
  return {
    verified: rows.filter((row) => row.is_verified),
    unverified: rows.filter((row) => !row.is_verified),
  };
}
