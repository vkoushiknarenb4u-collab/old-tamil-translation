-- CholaScript AI dataset. All application traffic uses the server-side service role;
-- no public/anon policies are created for these tables or the private storage bucket.
create extension if not exists pgcrypto;

create table if not exists public.reference_assets (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('chart', 'chart_crop', 'inscription', 'document')),
  storage_path text not null unique,
  source_title text not null,
  source_url text,
  period_label text,
  source_metadata jsonb not null default '{}'::jsonb,
  gemini_file_name text,
  parent_asset_id uuid references public.reference_assets(id) on delete set null,
  crop jsonb,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.character_labels (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.reference_assets(id) on delete cascade,
  character_text text not null,
  script_variant text,
  period_label text,
  notes text,
  is_verified boolean not null default false,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.historical_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  summary text,
  bibliographic_metadata jsonb not null default '{}'::jsonb,
  is_verified boolean not null default false,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (url)
);

create table if not exists public.inscriptions (
  id uuid primary key default gen_random_uuid(),
  reference_asset_id uuid references public.reference_assets(id) on delete set null,
  identifier text,
  original_transcription text not null default '',
  transliteration text not null default '',
  modern_tamil text not null default '',
  english_translation text not null default '',
  historical_explanation_tamil text not null default '',
  historical_explanation_english text not null default '',
  king text,
  temple text,
  approximate_period text,
  uncertain_segments jsonb not null default '[]'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified')),
  verified_by text,
  verified_at timestamptz,
  correction_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inscription_revisions (
  id uuid primary key default gen_random_uuid(),
  inscription_id uuid not null references public.inscriptions(id) on delete cascade,
  previous_record jsonb not null,
  corrected_record jsonb not null,
  editor text not null default 'administrator',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_feedback (
  id uuid primary key default gen_random_uuid(),
  inscription_id uuid references public.inscriptions(id) on delete set null,
  category text not null check (category in ('reading', 'translation', 'context', 'other')),
  message text not null,
  transcription_excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists character_labels_verified_idx on public.character_labels (is_verified, period_label);
create index if not exists historical_sources_verified_idx on public.historical_sources (is_verified);
create index if not exists inscriptions_status_idx on public.inscriptions (verification_status, created_at desc);
create index if not exists reference_assets_type_idx on public.reference_assets (asset_type, created_at desc);

alter table public.reference_assets enable row level security;
alter table public.character_labels enable row level security;
alter table public.historical_sources enable row level security;
alter table public.inscriptions enable row level security;
alter table public.inscription_revisions enable row level security;
alter table public.analysis_feedback enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values ('inscription-archive', 'inscription-archive', false, 20971520)
on conflict (id) do nothing;
