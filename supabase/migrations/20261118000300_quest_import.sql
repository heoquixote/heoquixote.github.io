-- Runner Quest 일회성 이관 도우미: n8n data table 행(JSON 배열)을 받아 Supabase 테이블에 넣는다.
-- n8n 「Supabase 이관」 워크플로우가 n8n_quest로 호출한다. 이관이 끝나면 맨 아래 drop 문으로 지운다.
-- 몇 번을 다시 돌려도 결과가 같도록 reset() 후 전부 다시 넣는 방식이다.

create schema if not exists quest_import;
revoke all on schema quest_import from public, anon, authenticated;
grant usage on schema quest_import to n8n_quest;

create or replace function quest_import.ts(v text) returns timestamptz
language sql stable as $$ select case when coalesce(v, '') = '' then null else v::timestamptz end $$;

create or replace function quest_import.reset() returns text
language plpgsql security definer set search_path = public as $$
begin
  truncate public.quest_party_clears, public.quest_parties, public.quest_friend_requests, public.quest_cheers,
           public.quest_stats, public.quest_friends, public.quest_logs, public.quest_config, public.quest_members;
  return 'reset';
end $$;

-- tbl: 테이블 이름, rows: n8n data table get 결과 배열
create or replace function quest_import.load(tbl text, rows jsonb) returns jsonb
language plpgsql security definer set search_path = public, quest_import as $$
declare n int := 0;
begin
  if jsonb_typeof(rows) <> 'array' then raise exception 'rows must be array'; end if;

  if tbl = 'quest_members' then
    insert into quest_members (email, name, password_hash, friend_code, invited_by, created_at, active, hidden, photo)
    select lower(trim(r->>'email')), coalesce(r->>'name', ''), coalesce(r->>'password_hash', ''), upper(r->>'friend_code'),
           nullif(lower(trim(coalesce(r->>'invited_by', ''))), ''),
           coalesce(ts(r->>'created_at'), ts(r->>'createdAt'), now()),
           coalesce((r->>'active')::boolean, true), coalesce((r->>'hidden')::boolean, false), nullif(r->>'photo', '')
    from jsonb_array_elements(rows) r where coalesce(r->>'email', '') <> ''
    on conflict (email) do nothing;

  elsif tbl = 'quest_friends' then
    insert into quest_friends (email, friend_email, created_at)
    select lower(r->>'email'), lower(r->>'friend_email'), coalesce(ts(r->>'created_at'), now())
    from jsonb_array_elements(rows) r
    where lower(r->>'email') <> lower(r->>'friend_email')
    on conflict do nothing;

  elsif tbl = 'quest_stats' then
    insert into quest_stats (email, stats, updated_at)
    select lower(r->>'email'), (r->>'stats')::jsonb, coalesce(ts(r->>'updated_at'), now())
    from jsonb_array_elements(rows) r
    where coalesce(r->>'stats', '') <> '' and exists (select 1 from quest_members m where m.email = lower(r->>'email'))
    on conflict (email) do update set stats = excluded.stats, updated_at = excluded.updated_at
      where quest_stats.updated_at < excluded.updated_at;

  elsif tbl = 'quest_cheers' then
    insert into quest_cheers (cheer_id, from_email, to_email, emoji, message, created_at, seen)
    select r->>'cheer_id', lower(r->>'from_email'), lower(r->>'to_email'), coalesce(r->>'emoji', '🔥'), left(coalesce(r->>'message', ''), 60),
           coalesce(ts(r->>'created_at'), now()), coalesce((r->>'seen')::boolean, false)
    from jsonb_array_elements(rows) r where coalesce(r->>'cheer_id', '') <> ''
    on conflict (cheer_id) do nothing;

  elsif tbl = 'quest_friend_requests' then
    insert into quest_friend_requests (req_id, from_email, to_email, status, message, created_at, updated_at)
    select r->>'req_id', lower(r->>'from_email'), lower(r->>'to_email'), coalesce(r->>'status', 'pending'), left(coalesce(r->>'message', ''), 40),
           coalesce(ts(r->>'created_at'), now()), coalesce(ts(r->>'updated_at'), ts(r->>'created_at'), now())
    from jsonb_array_elements(rows) r where coalesce(r->>'req_id', '') <> ''
    on conflict (req_id) do nothing;

  elsif tbl = 'quest_parties' then
    insert into quest_parties (party_id, name, emoji, goal, leader_email, members, invites, created_at, updated_at)
    select r->>'party_id', coalesce(r->>'name', '파티'), coalesce(r->>'emoji', '⚔️'),
           case when r->>'goal' in ('perfect', 'rate80') then r->>'goal' else 'perfect' end, lower(coalesce(r->>'leader_email', '')),
           coalesce(nullif(r->>'members', '')::jsonb, '[]'), coalesce(nullif(r->>'invites', '')::jsonb, '[]'),
           coalesce(ts(r->>'created_at'), now()), coalesce(ts(r->>'updated_at'), now())
    from jsonb_array_elements(rows) r where coalesce(r->>'party_id', '') <> ''
    on conflict (party_id) do nothing;

  elsif tbl = 'quest_party_clears' then
    insert into quest_party_clears (party_id, clear_date, members, xp, combo, created_at)
    select r->>'party_id', (r->>'clear_date')::date, coalesce(nullif(r->>'members', '')::jsonb, '[]'),
           coalesce((r->>'xp')::numeric, 0)::int, coalesce((r->>'combo')::numeric, 1)::int, coalesce(ts(r->>'created_at'), now())
    from jsonb_array_elements(rows) r
    where coalesce(r->>'party_id', '') <> '' and exists (select 1 from quest_parties p where p.party_id = r->>'party_id')
    on conflict (party_id, clear_date) do nothing;

  elsif tbl = 'quest_logs' then
    insert into quest_logs (owner_email, log_id, log_date, routine_id, title, category, kind, xp, minutes, note, created_at)
    select lower(r->>'owner_email'), r->>'log_id', (r->>'log_date')::date, coalesce(r->>'routine_id', ''), left(r->>'title', 80),
           coalesce(nullif(r->>'category', ''), 'life'), coalesce(nullif(r->>'kind', ''), 'adhoc'),
           coalesce((r->>'xp')::numeric, 0)::int, coalesce((r->>'minutes')::numeric, 0)::int, left(coalesce(r->>'note', ''), 500),
           coalesce(ts(r->>'created_at'), ts(r->>'createdAt'), now())
    from jsonb_array_elements(rows) r where coalesce(r->>'log_id', '') <> '' and coalesce(r->>'title', '') <> ''
    on conflict (owner_email, log_id) do nothing;

  elsif tbl = 'quest_config' then
    insert into quest_config (owner_email, key, value, saved_at)
    select lower(r->>'owner_email'), r->>'key', coalesce(r->>'value', 'null'), coalesce(ts(r->>'saved_at'), now())
    from jsonb_array_elements(rows) r where coalesce(r->>'key', '') <> ''
    on conflict (owner_email, key) do update set value = excluded.value, saved_at = excluded.saved_at
      where quest_config.saved_at <= excluded.saved_at;

  else
    raise exception 'unknown table %', tbl;
  end if;

  get diagnostics n = row_count;
  return jsonb_build_object('table', tbl, 'source', jsonb_array_length(rows), 'inserted', n);
end $$;

-- 원본과 행 수 비교용
create or replace function quest_import.counts() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'quest_members', (select count(*) from quest_members), 'quest_friends', (select count(*) from quest_friends),
    'quest_stats', (select count(*) from quest_stats), 'quest_cheers', (select count(*) from quest_cheers),
    'quest_friend_requests', (select count(*) from quest_friend_requests), 'quest_parties', (select count(*) from quest_parties),
    'quest_party_clears', (select count(*) from quest_party_clears), 'quest_logs', (select count(*) from quest_logs),
    'quest_config', (select count(*) from quest_config))
$$;

revoke all on all functions in schema quest_import from public, anon, authenticated;
grant execute on all functions in schema quest_import to n8n_quest;

-- 이관 확인 후 실행:
-- drop schema quest_import cascade;
