import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { splitVerifiedDataset } from "@/lib/dataset-repository";
import { getSupabase, hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: { code: "unauthorized", message: "Enter the configured administrator token." } }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: { code: "not_configured", message: "Supabase is not configured." } }, { status: 503 });
  const db = getSupabase();
  const [assets, labels, inscriptions, sources] = await Promise.all([
    db.from("reference_assets").select("*").limit(1000),
    db.from("character_labels").select("*").limit(2000),
    db.from("inscriptions").select("*").limit(1000),
    db.from("historical_sources").select("*").limit(1000),
  ]);
  if ([assets.error, labels.error, inscriptions.error, sources.error].some(Boolean)) return NextResponse.json({ error: { code: "storage_error", message: "Could not export the dataset." } }, { status: 500 });
  const payload = {
    generated_at: new Date().toISOString(),
    note: "Only verified rows are authoritative. Unverified chart labels and AI readings are kept separate.",
    reference_assets: splitVerifiedDataset(assets.data || []),
    character_labels: splitVerifiedDataset(labels.data || []),
    inscriptions: {
      verified: (inscriptions.data || []).filter((row) => row.verification_status === "verified"),
      unverified: (inscriptions.data || []).filter((row) => row.verification_status !== "verified"),
    },
    historical_sources: splitVerifiedDataset(sources.data || []),
  };
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const rows = [
      ["record_type", "id", "label_or_identifier", "period", "verified"],
      ...(payload.character_labels.verified.map((row) => ["character_label", row.id, row.character_text, row.period_label || "", true])),
      ...(payload.character_labels.unverified.map((row) => ["character_label", row.id, row.character_text, row.period_label || "", false])),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=cholascript-dataset.csv" } });
  }
  return NextResponse.json(payload);
}
