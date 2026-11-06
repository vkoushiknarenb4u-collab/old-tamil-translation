"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult } from "@/lib/analysis-schema";

type Status = { geminiReady: boolean; databaseConfigured: boolean; fileSearchReady: boolean; adminConfigured: boolean };
type AnalysisResponse = { result?: AnalysisResult; image?: { width: number; height: number; originalPreserved: boolean; enhancedCopySent: boolean; focusUsed?: boolean }; references?: { verifiedLabelsUsed: number; verifiedSourcesAvailable: number; warning: string | null }; error?: { code: string; message: string } };
type Tab = "original" | "modern" | "english" | "history";
type CropRect = { left: number; top: number; width: number; height: number };

const chartCards = [
  { src: "/reference-charts/history-of-tamil-script.jfif", title: "Tamil script through time", caption: "Era-by-era forms · unverified visual reference" },
  { src: "/reference-charts/tamil-script-evolution.jfif", title: "Tamil character forms", caption: "Chart supplied for review · no mappings asserted" },
  { src: "/reference-charts/tamil-script-reference.jpg", title: "Letter-form comparison", caption: "Historical chart · reference only" },
];

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HomePage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [focusFile, setFocusFile] = useState<File | null>(null);
  const [focusUrl, setFocusUrl] = useState("");
  const [focusWasUsed, setFocusWasUsed] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [referencesUsed, setReferencesUsed] = useState<AnalysisResponse["references"]>();
  const [activeTab, setActiveTab] = useState<Tab>("original");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("reading");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const evidenceImageRef = useRef<HTMLImageElement>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const stageLabels = focusFile
    ? ["Preparing the selected detail", "Comparing it with the full image", "Revising only readable passages"]
    : ["Preparing a readability copy", "Comparing script forms", "Drafting a cautious reading"];

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  }, []);

  function scrollToSection(id: string) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
  }

  useEffect(() => {
    if (!file) { setImageUrl(""); return; }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!focusFile) { setFocusUrl(""); return; }
    const url = URL.createObjectURL(focusFile);
    setFocusUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [focusFile]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setStage((current) => (current + 1) % stageLabels.length), 1800);
    return () => window.clearInterval(timer);
  }, [busy, stageLabels.length]);

  const fileNotice = useMemo(() => file ? `${file.name} · ${formatBytes(file.size)}` : "JPG, PNG or WebP · up to 12 MB", [file]);

  function acceptFile(candidate?: File) {
    setError(""); setResult(null); setReferencesUsed(undefined); setFeedbackSent(false); setFocusWasUsed(false);
    setFocusFile(null); setCropRect(null); setCropMode(false);
    if (!candidate) return;
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(candidate.type)) { setError("Choose a JPG, PNG, or WebP image."); return; }
    if (candidate.size > 12 * 1024 * 1024) { setError("This image is over 12 MB. Use a smaller copy to continue."); return; }
    setFile(candidate);
    requestAnimationFrame(() => scrollToSection("workspace"));
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { acceptFile(event.target.files?.[0]); }
  function onDrop(event: DragEvent<HTMLButtonElement>) { event.preventDefault(); acceptFile(event.dataTransfer.files?.[0]); }

  async function analyze(useFocus = false) {
    if (!file) return;
    if (useFocus && !focusFile) return;
    setBusy(true); setStage(0); setError("");
    if (!useFocus) setResult(null);
    try {
      const form = new FormData(); form.append("image", file);
      if (useFocus && focusFile) form.append("focus", focusFile);
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const payload = await response.json() as AnalysisResponse;
      if (!response.ok || !payload.result) throw new Error(payload.error?.message || "The inscription could not be analyzed.");
      setResult(payload.result); setReferencesUsed(payload.references); setFocusWasUsed(Boolean(payload.image?.focusUsed)); setActiveTab("original");
      requestAnimationFrame(() => scrollToSection("reading-results"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please retry.");
    } finally { setBusy(false); }
  }

  async function sendFeedback() {
    if (feedback.trim().length < 3) return;
    setError("");
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: feedbackCategory, message: feedback, transcription: result?.original_transcription }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Feedback could not be sent.");
      setFeedbackSent(true); setFeedback("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Feedback could not be sent."); }
  }

  const tabContents: Record<Tab, { eyebrow: string; text: string }> = result ? {
    original: { eyebrow: "Best-effort transcription", text: result.original_transcription },
    modern: { eyebrow: "Readable Tamil", text: result.modern_tamil },
    english: { eyebrow: "Translation", text: result.english_translation },
    history: { eyebrow: "Historical interpretation", text: `${result.historical_explanation_tamil}${result.historical_explanation_tamil && result.historical_explanation_english ? "\n\n" : ""}${result.historical_explanation_english}` },
  } : {
    original: { eyebrow: "Best-effort transcription", text: "" }, modern: { eyebrow: "Readable Tamil", text: "" }, english: { eyebrow: "Translation", text: "" }, history: { eyebrow: "Historical interpretation", text: "" },
  };

  return <main>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="CholaScript AI home"><span className="brand-mark">சோ</span><span><strong>CholaScript</strong><small>INSCRIPTION READER</small></span></Link>
      <nav><a href="#how-it-works">How it works</a><a href="#reference-library">Script references</a><Link href="/admin">Archive desk <span aria-hidden="true">↗</span></Link></nav>
      <div className="connection-pill"><i className={status?.geminiReady ? "dot online" : "dot"} />{status?.geminiReady ? "Gemini connected" : "Setup needed"}</div>
    </header>

    <section className="hero wrap">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-rule" />AI-assisted Tamil inscription reader</div>
        <h1>Read Tamil<br /><em>inscriptions</em></h1>
        <p className="hero-description">Upload a photograph for a careful transcription, modern Tamil, and an English translation. Uncertain marks stay visible for review.</p>
        <div className="hero-meta"><span><b>01</b> JPG, PNG, or WebP</span><span><b>02</b> Up to 12 MB</span><span><b>03</b> Original preserved</span></div>
        <button className="primary-button hero-action" type="button" onClick={() => inputRef.current?.click()}>Start a reading <span aria-hidden="true">↗</span></button>
      </div>
      <div className="hero-ornament" aria-hidden="true"><div className="sun-disc" /><div className="pillar pillar-left" /><div className="pillar pillar-right" /><div className="stone-stamp">𑀢𑀫𑀺𑀴<br /><span>தமிழ்</span></div><div className="ornament-caption">From image to reading draft</div></div>
    </section>

    <section id="workspace" className="workspace wrap" aria-label="Inscription analysis workspace">
      <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-rule" />Start a reading</div><h2>Inscription image analysis</h2></div><div className="privacy-note"><span className="lock-icon">◈</span><span>Your original image stays untouched.<br />An enhanced copy is used for legibility.</span></div></div>
      <div className="work-grid">
        <div className="upload-column">
          <button type="button" className={`dropzone ${file ? "has-file" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={onDrop} aria-label="Choose or drop an inscription image">
            {imageUrl ? <img className="upload-preview" src={imageUrl} alt="Selected inscription preview" /> : <span className="upload-icon"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 21V6m0 0-6 6m6-6 6 6M6 19v7h20v-7" /></svg></span>}
            <span className="drop-title">{file ? "Image ready to read" : "Drop an inscription image here"}</span>
            <span className="drop-subtitle">or <span className="browse-link">browse files</span></span>
            <span className="file-meta">{fileNotice}</span>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onFileChange} hidden />
          </button>
          <div className="upload-actions">
            <button className="primary-button" type="button" disabled={!file || busy || cropMode} onClick={() => analyze(Boolean(focusFile))}>{busy ? <><span className="spinner" /> Reading inscription…</> : <>{focusFile ? (result ? "Re-read selected detail" : "Analyze with selected detail") : "Begin careful reading"} <span aria-hidden="true">↗</span></>}</button>
            {file && !busy && <button className="text-button" type="button" onClick={() => { setFile(null); setFocusFile(null); setCropRect(null); setCropMode(false); setResult(null); setError(""); }}>Remove image</button>}
          </div>
          {busy && <div className="processing-card"><span className="processing-orbit" /><div><strong>{stageLabels[stage]}</strong><small>Original evidence and a readability copy are being compared.</small></div></div>}
          {error && <div className="alert error-alert" role="alert"><span>!</span>{error}</div>}
          {!status?.geminiReady && <div className="alert setup-alert"><span>i</span><div><strong>Analysis needs a Gemini API key</strong><small>Set <code>GEMINI_API_KEY</code> in <code>.env.local</code> and restart the app. No sample reading is substituted.</small></div></div>}
        </div>
        <div className="image-evidence">
          <div className="evidence-label"><span>Image evidence</span><span>{imageUrl ? "Original · unaltered" : "A good photo helps"}</span></div>
          {imageUrl ? <>
            <div className={cropMode ? "evidence-frame detail-image-stage crop-active" : "evidence-frame detail-image-stage"}>
              <img
                ref={evidenceImageRef}
                className="detail-photo"
                src={imageUrl}
                alt="Original uploaded inscription, unchanged. Select an area for a focused reading."
                draggable={false}
                onPointerDown={(event) => {
                  if (!cropMode || !evidenceImageRef.current) return;
                  event.preventDefault();
                  const bounds = evidenceImageRef.current.getBoundingClientRect();
                  const point = { x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)), y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)) };
                  cropStartRef.current = point;
                  setCropRect({ left: point.x, top: point.y, width: 1, height: 1 });
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!cropMode || !cropStartRef.current || !evidenceImageRef.current) return;
                  const bounds = evidenceImageRef.current.getBoundingClientRect();
                  const point = { x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)), y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)) };
                  const start = cropStartRef.current;
                  setCropRect({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
                }}
                onPointerUp={() => { cropStartRef.current = null; }}
                onPointerCancel={() => { cropStartRef.current = null; }}
              />
              {cropRect && (() => {
                const imageBounds = evidenceImageRef.current?.getBoundingClientRect();
                const frameBounds = evidenceImageRef.current?.parentElement?.getBoundingClientRect();
                return <div className="detail-selection" style={{
                  left: cropRect.left + (imageBounds && frameBounds ? imageBounds.left - frameBounds.left : 0),
                  top: cropRect.top + (imageBounds && frameBounds ? imageBounds.top - frameBounds.top : 0),
                  width: cropRect.width,
                  height: cropRect.height,
                }} />;
              })()}
              <div className="frame-corner top-left" /><div className="frame-corner top-right" /><div className="frame-corner bottom-left" /><div className="frame-corner bottom-right" />
            </div>
            <div className="detail-controls">
              <strong>Hard-to-read area?</strong>
              <p>Draw a box around a line or character. Gemini compares the close-up with the full photograph.</p>
              {!cropMode
                ? <button className="detail-select-button" type="button" onClick={() => { setCropMode(true); setCropRect(null); setError(""); }}>Select a detail area</button>
                : <div className="detail-action-row"><span>Drag over the original image above.</span><button className="text-button" type="button" onClick={() => { setCropMode(false); setCropRect(null); cropStartRef.current = null; }}>Cancel</button><button className="detail-select-button" type="button" disabled={!cropRect || cropRect.width < 10 || cropRect.height < 10} onClick={async () => {
                    const image = evidenceImageRef.current;
                    if (!image || !cropRect) return;
                    const scaleX = image.naturalWidth / image.clientWidth;
                    const scaleY = image.naturalHeight / image.clientHeight;
                    const left = Math.max(0, Math.min(image.naturalWidth - 1, Math.floor(cropRect.left * scaleX)));
                    const top = Math.max(0, Math.min(image.naturalHeight - 1, Math.floor(cropRect.top * scaleY)));
                    const width = Math.max(1, Math.min(image.naturalWidth - left, Math.ceil(cropRect.width * scaleX)));
                    const height = Math.max(1, Math.min(image.naturalHeight - top, Math.ceil(cropRect.height * scaleY)));
                    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
                    const context = canvas.getContext("2d");
                    if (!context) { setError("The selected area could not be prepared. Please try again."); return; }
                    context.drawImage(image, left, top, width, height, 0, 0, width, height);
                    try {
                      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The selected area could not be created.")), "image/png"));
                      setFocusFile(new File([blob], "inscription-detail.png", { type: "image/png" }));
                      setCropMode(false); setCropRect(null); setError("");
                    } catch (caught) { setError(caught instanceof Error ? caught.message : "The selected area could not be created."); }
                  }}>Use this crop</button></div>}
              {focusFile && <div className="focus-preview-card"><img src={focusUrl} alt="Selected close-up crop" /><div><strong>Detail ready for a focused read</strong><small>{result ? "The next reading will compare this crop with the full photo." : "The first reading will compare this crop with the full photo."}</small></div><button className="text-button" type="button" onClick={() => setFocusFile(null)}>Remove</button></div>}
            </div>
          </> : <div className="evidence-empty"><div className="evidence-line" /><div className="evidence-motif">𑀓 · 𑀶 · 𑀢</div><p>Original photograph appears here</p><small>Even lighting and a straight-on angle make letter forms easier to compare.</small></div>}
          <div className="evidence-footer"><span><i className="legend-dot" /> Source image</span><span>Kept unchanged</span></div>
        </div>
      </div>
    </section>

    {result && <section id="reading-results" className="results-section wrap">
      <div className="results-header"><div><div className="eyebrow"><span className="eyebrow-rule" />AI-assisted · human review needed</div><h2>Reading draft</h2></div><span className="status-badge"><i /> Unverified</span></div>
      <div className="result-layout">
        <div className="result-image">
          <div className="result-image-head"><span>The stone</span><small>{focusWasUsed ? "Focused reread · original unchanged" : "Original, unchanged"}</small></div>
          <div className="detail-image-stage result-image-stage"><img className="detail-photo result-detail-photo" src={imageUrl} alt="Uploaded inscription, unchanged." draggable={false} /></div>
        </div>
        <div className="result-copy">
          <div className="tabs" role="tablist" aria-label="Translation views">
            {([ ["original", "Original text"], ["modern", "Modern Tamil"], ["english", "English"], ["history", "Historical story"] ] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={activeTab === key} className={activeTab === key ? "tab active" : "tab"} onClick={() => setActiveTab(key)}>{label}</button>)}
          </div>
          <div className={`transcription-panel ${activeTab === "modern" ? "tamil-panel" : ""}`}>
            <div className="panel-eyebrow">{tabContents[activeTab].eyebrow}</div>
            <p>{tabContents[activeTab].text || "No readable text was returned. The model did not provide a reliable transcription for this image."}</p>
            {activeTab === "original" && result.transliteration && <div className="transliteration"><span>Transliteration</span><p>{result.transliteration}</p></div>}
          </div>
          {result.uncertain_segments.length > 0 && <div className="uncertainty-box"><span className="uncertainty-icon">?</span><div><strong>{result.uncertain_segments.length} uncertain {result.uncertain_segments.length === 1 ? "segment" : "segments"}</strong><small>{result.uncertain_segments.join(" · ")}</small><small className="uncertainty-guidance">Unclear marks stay unguessed. Select that area in the image panel to request a focused second read.</small></div></div>}
          <div className="claim-grid"><div><small>Ruler</small><strong>{result.king || "Not identified"}</strong></div><div><small>Place</small><strong>{result.temple || "Not identified"}</strong></div><div><small>Period</small><strong>{result.approximate_period || "Not identified"}</strong></div></div>
          <div className="source-list"><div className="source-list-heading"><span>Supporting sources</span><span>{result.source_references.length}</span></div>{result.source_references.length ? result.source_references.map((source) => <a key={`${source.title}${source.url}`} href={source.url} target="_blank" rel="noreferrer">{source.title}<span>↗</span></a>) : <p>No verified sources were available for this reading.</p>}
          </div>
          {referencesUsed?.warning && <p className="small-warning">{referencesUsed.warning}</p>}
        </div>
      </div>
      <div className="feedback-card"><div><span className="feedback-mark">↗</span><div><strong>Help improve this reading</strong><small>Tell us if a letter or explanation looks wrong. Your note is saved for a human reviewer.</small></div></div><div className="feedback-controls"><select value={feedbackCategory} onChange={(e) => setFeedbackCategory(e.target.value)} aria-label="Feedback category"><option value="reading">Letter reading</option><option value="translation">Translation</option><option value="context">Historical context</option><option value="other">Other</option></select><input value={feedback} onChange={(e) => { setFeedback(e.target.value); setFeedbackSent(false); }} placeholder="What should we review?" aria-label="Feedback message" maxLength={2000} /><button type="button" disabled={feedback.trim().length < 3} onClick={sendFeedback}>{feedbackSent ? "Sent ✓" : "Send note"}</button></div></div>
    </section>}

    <section id="how-it-works" className="method-section"><div className="wrap method-inner"><div className="method-heading"><div className="eyebrow"><span className="eyebrow-rule" />How it works</div><h2>Careful inscription readings</h2><p>CholaScript keeps the original image beside an AI reading draft, with uncertain marks visible for review.</p></div><div className="method-steps"><article><span>01</span><h3>Preserve</h3><p>Your original photograph stays intact. A separate contrast-balanced copy helps the model inspect faint marks.</p></article><article><span>02</span><h3>Compare</h3><p>Verified reference labels may inform the reading. Unchecked chart marks are never treated as facts.</p></article><article><span>03</span><h3>Review uncertainty</h3><p>Uncertain letters are marked. Rulers, temples and dates stay blank until evidence supports them.</p></article></div></div></section>

    <section id="reference-library" className="reference-section wrap"><div className="section-heading reference-heading"><div><div className="eyebrow"><span className="eyebrow-rule" />Script references</div><h2>Tamil script references</h2></div><p>Three charts supplied for this project. These are visual aids only; each label needs manual review before it can guide an authoritative reading.</p></div><div className="chart-grid">{chartCards.map((card, index) => <article className="chart-card" key={card.src}><div className="chart-image-wrap"><img src={card.src} alt={card.title} /><span className="chart-count">0{index + 1}</span></div><div className="chart-card-copy"><h3>{card.title}</h3><p>{card.caption}</p><span className="unverified-tag">Unverified source</span></div></article>)}</div><div className="reference-foot"><span>Additional charts and crop labels</span><Link href="/admin">Open the archive desk <span>↗</span></Link></div></section>

    <footer className="site-footer"><div className="wrap footer-inner"><Link className="brand footer-brand" href="/"><span className="brand-mark">சோ</span><span><strong>CholaScript</strong><small>INSCRIPTION READER</small></span></Link><p>For research and learning. AI readings are drafts, not epigraphic verification.</p><span>தமிழ் · கல் · காலம்</span></div></footer>
  </main>;
}
