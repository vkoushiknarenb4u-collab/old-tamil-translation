import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { saveReferenceAsset, splitVerifiedDataset } from "@/lib/dataset-repository";

describe("persistent reference dataset", () => {
  it("uploads the original bytes and stores provenance as unverified by default", async () => {
    let inserted: Record<string, unknown> | undefined;
    const upload = vi.fn(async (_path: string, _bytes: Buffer, _options: unknown) => ({ data: { path: "stored" }, error: null }));
    const client = {
      storage: { from: () => ({ upload, remove: vi.fn() }) },
      from: () => ({ insert: (value: Record<string, unknown>) => { inserted = value; return { select: () => ({ single: async () => ({ data: value, error: null }) }) }; } }),
    } as unknown as SupabaseClient;

    const bytes = Buffer.from([1, 2, 3, 4]);
    await saveReferenceAsset(client, {
      fileName: "period-chart.png", contentType: "image/png", bytes, assetType: "chart",
      sourceTitle: "User-supplied chart", sourceUrl: null, periodLabel: null,
    });

    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][1]).toEqual(bytes);
    expect(inserted).toMatchObject({ asset_type: "chart", source_title: "User-supplied chart", is_verified: false });
    expect(inserted?.source_metadata).toMatchObject({ original_filename: "period-chart.png" });
  });

  it("keeps verified rows separate from unverified records", () => {
    const result = splitVerifiedDataset([{ id: "a", is_verified: true }, { id: "b", is_verified: false }]);
    expect(result.verified.map((row) => row.id)).toEqual(["a"]);
    expect(result.unverified.map((row) => row.id)).toEqual(["b"]);
  });

  it("removes a stored object if the database insert fails", async () => {
    const remove = vi.fn(async () => ({ data: [], error: null }));
    const client = {
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), remove }) },
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: new Error("insert failed") }) }) }) }),
    } as unknown as SupabaseClient;
    await expect(saveReferenceAsset(client, { fileName: "a.jpg", contentType: "image/jpeg", bytes: Buffer.from([1]), assetType: "document", sourceTitle: "A" })).rejects.toThrow("insert failed");
    expect(remove).toHaveBeenCalledOnce();
  });
});
