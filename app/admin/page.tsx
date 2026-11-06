"use client";

import Link from "next/link";
import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";

type Asset = { id: string; asset_type: string; source_title: string; source_url: string | null; storage_path: string; period_label: string | null; is_verified: boolean; parent_asset_id: string | null; preview_url: string | null; crop?: { x: number; y: number; width: number; height: number } | null };
type Label = { id: string; asset_id: string; character_text: string; script_variant: string | null; period_label: string | null; notes: string | null; is_verified: boolean };
type Source = { id: string; title: string; url: string; summary: string | null; is_verified: boolean };
type Inscription = Record<string, unknown> & { id: string; identifier: string | null; verification_status: string; original_transcription: string; created_at: string };
type ArchiveData = { assets: Asset[]; labels: Label[]; inscriptions: Inscription[]; sources: Source[] };
type Tab = "references" | "sources" | "inscriptions";

const EMPTY_RESULT = {
  original_transcription: "", transliteration: "", modern_tamil: "", english_translation: "",
  historical_explanation_tamil: "", historical_explanation_english: "", king: null, temple: null,
  approximate_period: null, uncertain_segments: [], source_references: [], verification_status: "unverified",
};

async function responsePayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "The request could not be completed.");
  return payload;
}

function CropTool({ asset, token, onSaved }: { asset: Asset; token: string; onSaved: () => void }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [character, setCharacter] = useState("");
  const [variant, setVariant] = useState("");
  const [period, setPeriod] = useState(asset.period_label || "");
  const [notes, setNotes] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)), y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)) };
  }
  function start(event: PointerEvent<HTMLDivElement>) { const p = point(event); originRef.current = p; setRect({ left: p.x, top: p.y, width: 1, height: 1 }); setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!dragging || !originRef.current) return;
    const p = point(event); const startPoint = originRef.current;
    setRect({ left: Math.min(startPoint.x, p.x), top: Math.min(startPoint.y, p.y), width: Math.abs(p.x - startPoint.x), height: Math.abs(p.y - startPoint.y) });
  }
  function end(event: PointerEvent<HTMLDivElement>) { move(event); setDragging(false); }

  async function saveCropAndLabel() {
    const image = imageRef.current;
    if (!image || !rect || rect.width < 5 || rect.height < 5 || !character.trim()) { setMessage("Draw a crop and enter its manually checked character label."); return; }
    setBusy(true); setMessage("");
    try {
      const scaleX = image.naturalWidth / image.clientWidth; const scaleY = image.naturalHeight / image.clientHeight;
      const crop = { x: Math.round(rect.left * scaleX), y: Math.round(rect.top * scaleY), width: Math.max(1, Math.round(rect.width * scaleX)), height: Math.max(1, Math.round(rect.height * scaleY)) };
      const canvas = document.createElement("canvas"); canvas.width = crop.width; canvas.height = crop.height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Could not create the crop preview.");
      context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not export this crop.")), "image/png"));
      const form = new FormData();
      form.append("file", blob, `crop-${asset.id.slice(0, 8)}.png`); form.append("assetType", "chart_crop");
      form.append("sourceTitle", `${asset.source_title} · crop`); form.append("periodLabel", period); form.append("parentAssetId", asset.id); form.append("crop", JSON.stringify(crop));
      const saved = await responsePayload(await fetch("/api/admin/references", { method: "POST", headers: { "x-admin-token": token }, body: form }));
      await responsePayload(await fetch("/api/admin/labels", {
        method: "POST", headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ asset_id: saved.asset.id, character_text: character, script_variant: variant || null, period_label: period || null, notes: notes || null, is_verified: verified }),
      }));
      setMessage(verified ? "Crop and verified label saved to the archive." : "Crop and unverified label saved separately from verified readings.");
      setRect(null); setCharacter(""); setNotes(""); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Crop could not be saved."); }
    finally { setBusy(false); }
  }

  if (!asset.preview_url) return <div className="admin-notice">A preview link is unavailable. Refresh the archive list and try again.</div>;
  return <div className="crop-panel">
    <h3>Crop a chart section for review</h3>
    <p>Drag a rectangle around one character or chart cell. Its crop coordinates are saved against the original image.</p>
    <div className="crop-stage" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <img ref={imageRef} crossOrigin="anonymous" src={asset.preview_url} alt={`Crop source: ${asset.source_title}`} draggable={false} />
      {rect && <div className="crop-rect" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />}
    </div>
    <div className="field-row"><input className="field" value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="Character label (manual review)" aria-label="Character label" /><input className="field" value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Script variant" aria-label="Script variant" /><input className="field" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Period" aria-label="Period" /></div>
    <input className="field" style={{ marginTop: 7 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes or chart row / column" aria-label="Review notes" />
    <label className="check-row admin-form" style={{ marginTop: 8 }}><span><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> I manually verified this character label</span></label>
    <button className="admin-button" type="button" disabled={busy} onClick={saveCropAndLabel}>{busy ? "Saving crop…" : "Save crop and label"}</button>
    {message && <div className="admin-notice">{message}</div>}
  </div>;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<ArchiveData>({ assets: [], labels: [], inscriptions: [], sources: [] });
  const [tab, setTab] = useState<Tab>("references");
  const [selectedChart, setSelectedChart] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [assetType, setAssetType] = useState("chart");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [period, setPeriod] = useState("");
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyUrl, setHistoryUrl] = useState("");
  const [historySummary, setHistorySummary] = useState("");
  const [verifySource, setVerifySource] = useState(false);
  const [verifyAsset, setVerifyAsset] = useState(false);
  const [recordImage, setRecordImage] = useState<File | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [recordJson, setRecordJson] = useState(JSON.stringify(EMPTY_RESULT, null, 2));
  const [editId, setEditId] = useState("");
  const [editJson, setEditJson] = useState("");

  useEffect(() => { setToken(window.sessionStorage.getItem("cholascript-admin-token") || ""); }, []);

  async function loadData(authToken = token) {
    const payload = await responsePayload(await fetch("/api/admin/references", { headers: { "x-admin-token": authToken } }));
    setData(payload); setConnected(true); setError("");
  }
  async function connect() {
    setBusy(true); setError("");
    try { await loadData(token); window.sessionStorage.setItem("cholascript-admin-token", token); }
    catch (caught) { setConnected(false); setError(caught instanceof Error ? caught.message : "Could not connect to the archive."); }
    finally { setBusy(false); }
  }
  async function refresh() { try { await loadData(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not refresh the archive."); } }

  async function uploadAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!assetFile) { setError("Choose a file to upload."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.append("file", assetFile); form.append("assetType", assetType); form.append("sourceTitle", sourceTitle || assetFile.name);
      form.append("sourceUrl", sourceUrl); form.append("periodLabel", period); form.append("isVerifiedSource", String(verifyAsset));
      const response = await responsePayload(await fetch("/api/admin/references", { method: "POST", headers: { "x-admin-token": token }, body: form }));
      setMessage(`${verifyAsset ? "Verified source" : "Source uploaded as unverified"}.${response.fileSearchWarning ? ` ${response.fileSearchWarning}` : ""}`); setAssetFile(null); setSourceTitle(""); setSourceUrl(""); setPeriod(""); setVerifyAsset(false);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function saveHistorySource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await responsePayload(await fetch("/api/admin/sources", { method: "POST", headers: { "content-type": "application/json", "x-admin-token": token }, body: JSON.stringify({ title: historyTitle, url: historyUrl, summary: historySummary || null, is_verified: verifySource }) }));
      setMessage(verifySource ? "Bibliographic source saved as admin-verified." : "Source saved as unverified. It will not be offered as a citation yet.");
      setHistoryTitle(""); setHistoryUrl(""); setHistorySummary(""); setVerifySource(false); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Source could not be saved."); }
    finally { setBusy(false); }
  }

  async function saveInscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!recordImage) { setError("Choose the inscription photograph to archive."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.append("image", recordImage); form.append("identifier", identifier); form.append("result", recordJson);
      await responsePayload(await fetch("/api/admin/inscriptions", { method: "POST", headers: { "x-admin-token": token }, body: form }));
      setMessage("Inscription and current transcription saved."); setRecordImage(null); setIdentifier(""); setRecordJson(JSON.stringify(EMPTY_RESULT, null, 2)); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Inscription could not be saved."); }
    finally { setBusy(false); }
  }

  function editRecord(record: Inscription) {
    const fields = ["original_transcription", "transliteration", "modern_tamil", "english_translation", "historical_explanation_tamil", "historical_explanation_english", "king", "temple", "approximate_period", "uncertain_segments", "source_references", "verification_status"];
    const object: Record<string, unknown> = {};
    fields.forEach((key) => { object[key] = record[key] ?? (key === "uncertain_segments" || key === "source_references" ? [] : key === "verification_status" ? "unverified" : key === "king" || key === "temple" || key === "approximate_period" ? null : ""); });
    setEditId(record.id); setEditJson(JSON.stringify(object, null, 2));
  }
  async function saveCorrection() {
    setBusy(true); setError(""); setMessage("");
    try {
      const body = JSON.parse(editJson);
      await responsePayload(await fetch(`/api/admin/inscriptions/${editId}`, { method: "PATCH", headers: { "content-type": "application/json", "x-admin-token": token }, body: JSON.stringify(body) }));
      setMessage("Correction and revision history saved."); setEditId(""); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Correction could not be saved."); }
    finally { setBusy(false); }
  }

  async function exportDataset(format: "json" | "csv") {
    setError("");
    try {
      const response = await fetch(`/api/admin/dataset${format === "csv" ? "?format=csv" : ""}`, { headers: { "x-admin-token": token } });
      if (!response.ok) throw new Error((await response.json()).error?.message || "Export failed.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `cholascript-dataset.${format}`; link.click(); URL.revokeObjectURL(url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Export failed."); }
  }

  const chartAssets = data.assets.filter((asset) => asset.asset_type === "chart");

  return <main className="admin-shell">
    <header className="admin-top"><Link className="brand" href="/"><span className="brand-mark">சோ</span><span><strong>CholaScript</strong><small>ARCHIVE DESK</small></span></Link><Link href="/">← Back to reader</Link></header>
    <section className="admin-main">
      <div className="admin-kicker">CURATION WORKSPACE · HUMAN REVIEW REQUIRED</div>
      <h1>The archive desk</h1>
      <p className="admin-intro">Add script charts and records, crop individual forms for review, and distinguish verified readings from working material. Nothing becomes an authoritative reference until an administrator marks it verified.</p>

      {!connected ? <div className="admin-card admin-connect"><h2>Connect to the archive</h2><p>Enter the server-configured administrator token. Supabase must also be configured in the server environment.</p><div className="admin-connect-row"><input type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Administrator token" aria-label="Administrator token" /><button onClick={connect} disabled={busy || !token}>{busy ? "Connecting…" : "Connect"}</button></div>{error && <div className="admin-error">{error}</div>}</div> : <>
        <div className="export-row" style={{ marginTop: 22 }}><button className="admin-button" onClick={() => exportDataset("json")}>Export verified + unverified JSON</button><button className="admin-button" onClick={() => exportDataset("csv")}>Export labels CSV</button><button className="text-button" onClick={() => { window.sessionStorage.removeItem("cholascript-admin-token"); setConnected(false); setToken(""); }}>Disconnect</button></div>
        <div className="admin-tabs" role="tablist">
          {([ ["references", "Charts & documents"], ["sources", "Bibliography"], ["inscriptions", "Inscription records"] ] as const).map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}>{label}</button>)}
        </div>
        {error && <div className="admin-error">{error}</div>}{message && <div className="admin-notice">{message}</div>}
        {tab === "references" && <div className="admin-grid">
          <div className="admin-card"><h2>Ingest a reference</h2><p>Upload an original chart, inscription photograph, or historical document. The raw file and source metadata are saved separately from its labels.</p><form className="admin-form" onSubmit={uploadAsset}>
            <label>ASSET TYPE<select value={assetType} onChange={(e) => setAssetType(e.target.value)}><option value="chart">Script chart</option><option value="inscription">Inscription photograph</option><option value="document">Historical document</option></select></label>
            <label>FILE<input type="file" onChange={(e) => setAssetFile(e.target.files?.[0] || null)} required /></label>
            <label>SOURCE TITLE<input value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder="Title or archival identifier" required /></label>
            <label>SOURCE URL (optional)<input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" /></label>
            <label>PERIOD / SCRIPT LABEL (optional)<input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Leave blank if unknown" /></label>
            <label className="check-row"><input type="checkbox" checked={verifyAsset} onChange={(e) => setVerifyAsset(e.target.checked)} /> I checked this source's provenance</label>
            <button className="admin-button" disabled={busy}>{busy ? "Uploading…" : verifyAsset ? "Upload verified source" : "Upload unverified source"}</button>
          </form></div>
          <div className="admin-card"><h2>Reference collection <span className="asset-status">{data.assets.length} ASSETS</span></h2><p>Select a chart to crop a character cell. Each crop remains linked to its original source.</p><div className="asset-list">{data.assets.length ? data.assets.map((asset) => <article className="asset-item" key={asset.id}>
            {asset.preview_url ? <img src={asset.preview_url} alt="" /> : <div className="empty-admin">No preview</div>}
            <div><strong>{asset.source_title}</strong><small>{asset.asset_type} · {asset.period_label || "period unknown"}<br />{asset.source_url || "Source URL not recorded"}</small><span className="asset-status">{asset.is_verified ? "VERIFIED ASSET" : "UNVERIFIED SOURCE"}</span>{asset.asset_type === "chart" && <div><button className="text-button" onClick={() => setSelectedChart(asset)}>Crop & review</button></div>}</div>
          </article>) : <div className="empty-admin">No uploaded assets yet. The three supplied charts are in the public reference room and manifest.</div>}</div>{selectedChart && <CropTool key={selectedChart.id} asset={selectedChart} token={token} onSaved={refresh} />}</div>
          <div className="admin-card" style={{ gridColumn: "1 / -1" }}><h2>Character labels <span className="asset-status">{data.labels.length} LABELS</span></h2><p>Verified records can guide future readings. Unverified labels remain available for review and export, but are excluded from analysis context.</p><div className="source-list-admin">{data.labels.length ? data.labels.map((label) => <div className="source-row" key={label.id}><span><strong>{label.character_text}</strong> · {label.script_variant || "variant unknown"} · {label.period_label || "period unknown"}{label.notes && <small> — {label.notes}</small>}</span><span className="asset-status">{label.is_verified ? "VERIFIED" : "UNVERIFIED"}</span></div>) : <div className="empty-admin">No character labels yet. Crop a chart above to add a manually reviewed label.</div>}</div></div>
        </div>}
        {tab === "sources" && <div className="admin-grid" style={{ marginTop: 17 }}>
          <div className="admin-card"><h2>Add a bibliography source</h2><p>Only admin-verified sources are offered as historical citations to Gemini.</p><form className="admin-form" onSubmit={saveHistorySource}>
            <label>TITLE<input value={historyTitle} onChange={(e) => setHistoryTitle(e.target.value)} placeholder="Book, archive record, or paper" required /></label>
            <label>URL<input type="url" value={historyUrl} onChange={(e) => setHistoryUrl(e.target.value)} placeholder="https://…" required /></label>
            <label>NOTES / SUMMARY<textarea value={historySummary} onChange={(e) => setHistorySummary(e.target.value)} placeholder="Relevant page, record number, or notes" /></label>
            <label className="check-row"><input type="checkbox" checked={verifySource} onChange={(e) => setVerifySource(e.target.checked)} /> I checked this bibliographic record</label>
            <button className="admin-button" disabled={busy}>Save bibliographic record</button>
          </form></div>
          <div className="admin-card"><h2>Source collection</h2><p>{data.sources.filter((source) => source.is_verified).length} verified · {data.sources.filter((source) => !source.is_verified).length} unverified</p><div className="source-list-admin">{data.sources.length ? data.sources.map((source) => <div className="source-row" key={source.id}><span><strong>{source.title}</strong><br /><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>{source.summary && <small><br />{source.summary}</small>}</span><span className="asset-status">{source.is_verified ? "VERIFIED" : "UNVERIFIED"}</span></div>) : <div className="empty-admin">No sources have been added.</div>}</div></div>
        </div>}
        {tab === "inscriptions" && <div className="admin-grid" style={{ marginTop: 17 }}>
          <div className="admin-card"><h2>Archive a transcription</h2><p>Correct the model draft before saving. Choose “verified” only after a human has checked the inscription reading.</p><form className="admin-form" onSubmit={saveInscription}>
            <label>INSCRIPTION IMAGE<input type="file" accept="image/*" onChange={(e) => setRecordImage(e.target.files?.[0] || null)} required /></label>
            <label>IDENTIFIER (optional)<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Archive number / local identifier" /></label>
            <label>TRANSCRIPTION + TRANSLATION JSON<textarea value={recordJson} onChange={(e) => setRecordJson(e.target.value)} spellCheck={false} /></label>
            <button className="admin-button" disabled={busy}>{busy ? "Saving…" : "Save inscription record"}</button>
          </form></div>
          <div className="admin-card"><h2>Inscription records <span className="asset-status">{data.inscriptions.length}</span></h2><p>Manual corrections are recorded as revisions.</p><div className="source-list-admin">{data.inscriptions.length ? data.inscriptions.map((record) => <article key={record.id} className="record-editor"><h3>{record.identifier || "Unnumbered inscription"}</h3><small>{record.created_at.slice(0, 10)} · {String(record.verification_status).toUpperCase()}</small><p style={{ font: "11px/1.5 var(--serif)", margin: "8px 0" }}>{record.original_transcription || "No transcription"}</p>{editId === record.id ? <><textarea value={editJson} onChange={(e) => setEditJson(e.target.value)} spellCheck={false} /><button className="admin-button" disabled={busy} onClick={saveCorrection}>{busy ? "Saving…" : "Save correction"}</button><button className="text-button" onClick={() => setEditId("")}>Cancel</button></> : <button className="text-button" onClick={() => editRecord(record)}>Correct / verify</button>}</article>) : <div className="empty-admin">No inscription records have been saved.</div>}</div></div>
        </div>}
      </>}
      <div className="admin-notice"><strong>Evidence policy.</strong> Uploaded charts are reference material, not verified transcriptions. AI-generated readings stay unverified until a human reviews and saves a correction.</div>
    </section>
  </main>;
}
