-- Runner Quest 2단계: 기록·설정 테이블 + 접근 제어(RLS)
-- 인증은 지금처럼 n8n(dl_sessions·패스키)이 맡고, n8n은 전용 DB 역할 n8n_quest로만 접속한다.
--
-- 실행 전에 아래 '여기에-강한-비밀번호' 를 바꿔 주세요 (n8n Postgres 자격증명에 같은 값을 넣습니다).

-- ---------- 기록 (1건 = 1행) ----------
create table if not exists public.quest_logs (
  owner_email text not null references public.quest_members(email) on delete cascade,
  log_id      text not null check (log_id ~ '^[a-zA-Z0-9_-]{6,48}$'),
  log_date    date not null,
  routine_id  text not null default '',
  title       text not null check (length(title) between 1 and 80),
  category    text not null default 'life',
  kind        text not null default 'adhoc' check (kind in ('routine', 'adhoc', 'skip')),
  xp          integer not null default 0 check (xp between 0 and 1000),
  minutes     integer not null default 0 check (minutes between 0 and 1440),
  note        text not null default '' check (length(note) <= 500),
  created_at  timestamptz not null default now(),
  primary key (owner_email, log_id)       -- 같은 기록을 두 번 보내도(오프라인 재전송) 한 번만 저장
);
create index if not exists quest_logs_owner_date_idx on public.quest_logs (owner_email, log_date);
create index if not exists quest_logs_date_idx on public.quest_logs (log_date);

-- ---------- 설정 (routines, profile, retros) ----------
create table if not exists public.quest_config (
  owner_email text not null references public.quest_members(email) on delete cascade,
  key         text not null,
  value       text not null check (length(value) <= 100000),   -- 앱이 보낸 JSON 문자열 그대로
  saved_at    timestamptz not null default now(),
  primary key (owner_email, key)
);

-- ---------- n8n 전용 역할 ----------
-- 슈퍼유저(postgres) 대신 이 역할로 접속하면 RLS가 적용되고, 필요한 명령만 쓸 수 있다.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'n8n_quest') then
    create role n8n_quest login password '여기에-강한-비밀번호' noinherit;
  end if;
end $$;
alter role n8n_quest set statement_timeout = '15s';

grant usage on schema public to n8n_quest;
grant usage on schema extensions to n8n_quest;

-- 테이블별 최소 권한 (DELETE는 기록 삭제에만)
grant select, insert, update          on public.quest_members         to n8n_quest;
grant select, insert                  on public.quest_friends         to n8n_quest;
grant select, insert, update          on public.quest_stats           to n8n_quest;
grant select, insert, update (seen)   on public.quest_cheers          to n8n_quest;
grant select, insert, update          on public.quest_friend_requests to n8n_quest;
grant select, insert, update          on public.quest_parties         to n8n_quest;
grant select, insert, update          on public.quest_party_clears    to n8n_quest;
grant select, insert, delete          on public.quest_logs            to n8n_quest;
grant select, insert, update          on public.quest_config          to n8n_quest;
grant select                          on public.quest_league_board    to n8n_quest;
grant execute on function public.quest_global_league(text, int) to n8n_quest;
grant execute on function public.quest_social_ctx(text, jsonb)  to n8n_quest;
grant execute on function public.quest_iso(timestamptz), public.quest_league_uid(text), public.quest_jnum(jsonb, text) to n8n_quest;

-- ---------- Supabase 공개 API(anon/authenticated) 차단 ----------
-- 이 프로젝트는 Supabase REST·Realtime을 쓰지 않는다. 키가 새어도 데이터가 안 보이도록 권한을 거두고 RLS로 막는다.
revoke all on public.quest_members, public.quest_friends, public.quest_stats, public.quest_cheers,
              public.quest_friend_requests, public.quest_parties, public.quest_party_clears,
              public.quest_logs, public.quest_config, public.quest_league_board
  from anon, authenticated;
revoke execute on function public.quest_global_league(text, int), public.quest_social_ctx(text, jsonb)
  from public, anon, authenticated;

-- ---------- RLS ----------
-- anon/authenticated에는 정책이 없으므로 모든 행이 거부된다. n8n_quest에는 명령별 정책만 연다.
alter table public.quest_members         enable row level security;
alter table public.quest_friends         enable row level security;
alter table public.quest_stats           enable row level security;
alter table public.quest_cheers          enable row level security;
alter table public.quest_friend_requests enable row level security;
alter table public.quest_parties         enable row level security;
alter table public.quest_party_clears    enable row level security;
alter table public.quest_logs            enable row level security;
alter table public.quest_config          enable row level security;

-- 회원: 비활성 회원은 n8n에서도 보이지 않음(탈퇴·정지 처리 = active false)
drop policy if exists n8n_select on public.quest_members;
create policy n8n_select on public.quest_members for select to n8n_quest using (active);
drop policy if exists n8n_insert on public.quest_members;
create policy n8n_insert on public.quest_members for insert to n8n_quest with check (active and friend_code ~ '^[A-Z0-9]{8}$');
drop policy if exists n8n_update on public.quest_members;
create policy n8n_update on public.quest_members for update to n8n_quest using (active) with check (active);

-- 친구: 자기 자신과 친구가 될 수 없음(테이블 check), 삽입·조회만
drop policy if exists n8n_select on public.quest_friends;
create policy n8n_select on public.quest_friends for select to n8n_quest using (true);
drop policy if exists n8n_insert on public.quest_friends;
create policy n8n_insert on public.quest_friends for insert to n8n_quest with check (true);

-- 스냅샷: 4000자 제한
drop policy if exists n8n_all on public.quest_stats;
create policy n8n_all on public.quest_stats for all to n8n_quest using (true) with check (length(stats::text) <= 4000);

-- 응원: 친구 사이에서만 보낼 수 있음(DB에서 한 번 더 확인)
drop policy if exists n8n_select on public.quest_cheers;
create policy n8n_select on public.quest_cheers for select to n8n_quest using (true);
drop policy if exists n8n_insert on public.quest_cheers;
create policy n8n_insert on public.quest_cheers for insert to n8n_quest with check (
  exists (select 1 from public.quest_friends f where f.email = from_email and f.friend_email = to_email));
drop policy if exists n8n_update on public.quest_cheers;
create policy n8n_update on public.quest_cheers for update to n8n_quest using (true) with check (true);

-- 친구 신청: 비공개 회원에게 새 신청(pending)을 넣을 수 없음
drop policy if exists n8n_select on public.quest_friend_requests;
create policy n8n_select on public.quest_friend_requests for select to n8n_quest using (true);
drop policy if exists n8n_insert on public.quest_friend_requests;
create policy n8n_insert on public.quest_friend_requests for insert to n8n_quest with check (
  status <> 'pending' or exists (select 1 from public.quest_members m where m.email = to_email and not m.hidden));
drop policy if exists n8n_update on public.quest_friend_requests;
create policy n8n_update on public.quest_friend_requests for update to n8n_quest using (true) with check (true);

-- 파티·클리어
drop policy if exists n8n_all on public.quest_parties;
create policy n8n_all on public.quest_parties for all to n8n_quest using (true) with check (jsonb_array_length(members) <= 5);
drop policy if exists n8n_all on public.quest_party_clears;
create policy n8n_all on public.quest_party_clears for all to n8n_quest using (true) with check (true);

-- 기록·설정
drop policy if exists n8n_all on public.quest_logs;
create policy n8n_all on public.quest_logs for all to n8n_quest using (true) with check (true);
drop policy if exists n8n_all on public.quest_config;
create policy n8n_all on public.quest_config for all to n8n_quest using (true) with check (key in ('routines', 'profile', 'retros'));
