# CholaScript AI

An uncertainty-aware web app for inspecting historical Tamil inscription photographs. It keeps the original image intact, sends the original and a contrast-balanced working copy to Gemini, validates the response against a backend schema, and separates human-verified records from AI drafts and unchecked chart labels.

The three supplied images are included in `public/reference-charts/` and described in `reference-data/manifest.json`. They are chart images, not inscription photographs. They are explicitly marked as unverified visual references; no character labels or transcription are inferred from them.

## Requirements

- Node.js 22 or newer
- A Gemini API key for live reading
- A Supabase project for persistent archive and feedback storage

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
```

Fill in `.env.local` on the server. Keep `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` private; neither is used in browser code. Set `ADMIN_TOKEN` to a long random value before using `/admin`.

Apply the database migration from the Supabase SQL editor:

```text
supabase/migrations/202610270001_initial.sql
```

Then start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`. Without `GEMINI_API_KEY`, the upload interface remains visible and reports setup status; it does not display a pretend transcription. Supabase is needed for archive administration and feedback persistence.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only Gemini API key |
| `GEMINI_MODEL` | Optional model override; defaults to `gemini-3.6-flash` |
| `GEMINI_FILE_SEARCH_STORE_ID` | Optional Gemini File Search store name |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | Optional private bucket name; defaults to `inscription-archive` |
| `ADMIN_TOKEN` | Server-only token required by `/api/admin/*` |

## Archive setup

The Supabase migration creates private storage and tables for reference charts and crops, manually reviewed character labels, bibliography records, inscription transcriptions, revision history, and feedback. Row-level security is enabled with no anonymous policies; API routes use the server-only service-role client. The admin archive desk is at `/admin`.

The supplied chart files can be copied into the persistent Supabase archive after applying the migration:

```powershell
npm run ingest:charts
```

This imports the originals and metadata from `reference-data/manifest.json` as unverified assets. It does not create any character mapping.

For semantic retrieval over verified documents and multimodal chart files, create a Gemini File Search store:

```powershell
npm run create:file-search-store
```

Copy the printed store name to `GEMINI_FILE_SEARCH_STORE_ID` in `.env.local`, then restart the app. Only files whose source provenance was explicitly checked in the archive desk are sent to that store. Uploads are persisted in Supabase whether or not File Search is configured. Verified character labels and bibliographic records are also retrieved directly from Supabase and supplied with the image prompt.

From `/admin` you can:

- Upload charts, inscription photographs, and historical documents with source metadata.
- Crop individual chart sections and label the crop manually.
- Keep character labels unverified or mark an individual label as human-verified.
- Add bibliography sources; only checked sources are offered for citations.
- Enter/correct inscription fields, save records, and explicitly mark human-verified readings.
- Correct existing records; each correction gets a revision-history row.
- Export JSON with verified and unverified collections separated, or export character labels as CSV.

## Reading behavior

- Accepted inscription uploads: JPG/JPEG, PNG, WebP, maximum 12 MB.
- The untouched original is passed to Gemini alongside a separate normalized/sharpened JPEG copy. The original is never overwritten.
- Small image pairs use inline image data. If their encoded size approaches Gemini's 20 MB inline limit, the server temporarily uploads both files through the Gemini Files API and deletes those uploads after the interaction; Gemini automatically expires a temporary file after 48 hours if cleanup is interrupted.
- Gemini calls use the official `@google/genai` SDK and the Interactions API with structured JSON output. The default model is `gemini-3.6-flash`; set `GEMINI_MODEL` to another supported model if needed. Requests use `store: false`.
- Gemini File Search is optional. When not configured, the app uses the verified records retrieved from Supabase and reports no pretend source citations.
- All readings start as `unverified`. Unknown ruler, place, and period fields stay `null`. Citations not found among verified Supabase sources or verified File Search annotations are removed by the backend.
- Reference charts are not accepted as proof of an inscription reading. Uncertain passages must be marked in the transcription.

## Checks

```powershell
npm test
npm run build
```

Tests cover image type/size/content validation, preservation of original bytes, structured output validation, API error mapping, verified/unverified dataset separation, and storage rollback if database insertion fails.

An end-to-end Gemini reading still requires a configured API key, a configured database for persistent history, and an inscription photograph. The three attached files are script-evolution charts rather than a stone inscription, so they are not presented as a successful inscription-reading test.
# old-tamil-translation
