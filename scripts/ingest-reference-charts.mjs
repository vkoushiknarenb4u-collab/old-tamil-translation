import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, "reference-data", "manifest.json"), "utf8"));
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before ingesting the supplied charts.");
}

const bucket = process.env.SUPABASE_STORAGE_BUCKET || "inscription-archive";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const asset of manifest.assets) {
  const existing = await supabase.from("reference_assets").select("id").eq("source_title", asset.source_title).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) { console.log(`Already ingested: ${asset.source_title}`); continue; }
  const localPath = join(root, "public", "reference-charts", asset.file);
  const bytes = await readFile(localPath);
  const ext = extname(asset.file).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const storagePath = `references/chart/${asset.file}`;
  const stored = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: true });
  if (stored.error) throw stored.error;
  const inserted = await supabase.from("reference_assets").insert({
    asset_type: "chart", storage_path: storagePath, source_title: asset.source_title,
    source_url: asset.source_url, period_label: asset.period_label,
    source_metadata: { original_filename: asset.file, user_supplied: true }, is_verified: false,
  });
  if (inserted.error) throw inserted.error;
  console.log(`Ingested unverified source: ${asset.source_title}`);
}
