-- VOCA 앱 DB 셋업
-- Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- https://supabase.com/dashboard/project/nzsnuyodgmfwlrlrtped/sql/new

-- 1) 단어장
create table if not exists words (
  id bigint generated always as identity primary key,
  day int not null,
  num int not null,
  word text not null unique,
  meaning text not null
);

-- 2) 시험 성적
create table if not exists results (
  id bigint generated always as identity primary key,
  sync_code text not null,
  taken_at timestamptz not null default now(),
  scope text,
  mode text,
  total int,
  correct int,
  pct int,
  wrong_words jsonb not null default '[]'::jsonb
);
create index if not exists results_sync_idx on results (sync_code, taken_at desc);

-- 3) 오답노트
create table if not exists wrong_notes (
  sync_code text not null,
  word text not null,
  wrong_count int not null default 1,
  streak int not null default 0,
  last_wrong date,
  primary key (sync_code, word)
);

-- RLS: 로그인 없는 개인용 앱이므로 publishable key로 읽기/쓰기 허용
alter table words enable row level security;
alter table results enable row level security;
alter table wrong_notes enable row level security;

drop policy if exists words_all on words;
create policy words_all on words for all using (true) with check (true);

drop policy if exists results_all on results;
create policy results_all on results for all using (true) with check (true);

drop policy if exists wrong_notes_all on wrong_notes;
create policy wrong_notes_all on wrong_notes for all using (true) with check (true);
