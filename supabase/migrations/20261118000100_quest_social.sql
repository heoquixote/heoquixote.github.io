-- Runner Quest 1단계: 소셜 계열 테이블 (회원·친구·스냅샷·응원·친구 신청·파티)
-- n8n data table에서 옮겨 온 구조를 그대로 따르되, 타입·키·인덱스를 Postgres답게 정리했다.
-- 실행: Supabase 대시보드 > SQL Editor 에서 이 파일 → 000200 → 000300 순서로 실행.

create extension if not exists pgcrypto with schema extensions;

-- ISO 8601(UTC, 밀리초) 문자열. n8n 코드가 문자열 비교를 하므로 읽을 때 이 형식으로 돌려준다.
create or replace function public.quest_iso(t timestamptz)
returns text language sql immutable as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- 전체 리그 공개 ID: 'u' + HMAC-SHA256(key 'rq-league-v1', email) 앞 11자 (n8n Social Logic uidOf와 동일)
create or replace function public.quest_league_uid(e text)
returns text language sql immutable as $$
  select 'u' || left(encode(extensions.hmac(lower(trim(e)), 'rq-league-v1', 'sha256'), 'hex'), 11)
$$;

-- 안전한 숫자 추출 (클라이언트가 올린 JSON이라 숫자가 아닐 수 있음)
create or replace function public.quest_jnum(j jsonb, k text)
returns bigint language sql immutable as $$
  select case when jsonb_typeof(j -> k) = 'number' and abs((j ->> k)::numeric) < 1e12
              then round((j ->> k)::numeric)::bigint else 0 end
$$;

-- ---------- 회원 ----------
create table if not exists public.quest_members (
  email         text primary key check (email = lower(email) and length(email) <= 120),
  name          text not null default '',
  password_hash text not null default '',          -- scrypt 's1$salt$hash' (오너는 빈 값, 패스키·dl/login 사용)
  friend_code   text not null unique check (friend_code ~ '^[A-Z0-9]{8}$'),
  invited_by    text references public.quest_members(email) on delete set null,
  created_at    timestamptz not null default now(),
  active        boolean not null default true,
  hidden        boolean not null default false,   -- true면 친구 아닌 사람의 전체 리그·검색·신청에서 제외
  photo         text check (photo is null or length(photo) < 60000),
  league_uid    text generated always as (public.quest_league_uid(email)) stored unique
);

-- ---------- 친구 (양방향 2행) ----------
create table if not exists public.quest_friends (
  email        text not null references public.quest_members(email) on delete cascade,
  friend_email text not null references public.quest_members(email) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (email, friend_email),
  check (email <> friend_email)
);
create index if not exists quest_friends_friend_idx on public.quest_friends (friend_email);

-- ---------- 기록 요약 스냅샷 (앱이 stats_push로 올림, 4000자 이하 JSON) ----------
create table if not exists public.quest_stats (
  email       text primary key references public.quest_members(email) on delete cascade,
  stats       jsonb not null check (jsonb_typeof(stats) = 'object'),
  updated_at  timestamptz not null default now(),
  -- 랭킹 정렬·인덱스용으로 JSON에서 뽑아 둔 열 (stats가 바뀌면 자동 갱신)
  week_key    text   generated always as (stats ->> 'week_key') stored,
  week_xp     bigint generated always as (public.quest_jnum(stats, 'week_xp')) stored,
  season_key  text   generated always as (stats ->> 'season_key') stored,
  season_xp   bigint generated always as (public.quest_jnum(stats, 'season_xp')) stored,
  total_xp    bigint generated always as (public.quest_jnum(stats, 'total_xp')) stored,
  level       bigint generated always as (public.quest_jnum(stats, 'level')) stored
);
create index if not exists quest_stats_week_idx on public.quest_stats (week_key, week_xp desc);
create index if not exists quest_stats_season_idx on public.quest_stats (season_key, season_xp desc);

-- ---------- 응원 ----------
create table if not exists public.quest_cheers (
  cheer_id   text primary key,
  from_email text not null references public.quest_members(email) on delete cascade,
  to_email   text not null references public.quest_members(email) on delete cascade,
  emoji      text not null,
  message    text not null default '' check (length(message) <= 60),
  created_at timestamptz not null default now(),
  seen       boolean not null default false
);
create index if not exists quest_cheers_to_idx on public.quest_cheers (to_email, created_at desc);
create index if not exists quest_cheers_unseen_idx on public.quest_cheers (to_email) where not seen;

-- ---------- 친구 신청 ----------
create table if not exists public.quest_friend_requests (
  req_id     text primary key,
  from_email text not null references public.quest_members(email) on delete cascade,
  to_email   text not null references public.quest_members(email) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  message    text not null default '' check (length(message) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_email <> to_email)
);
create index if not exists quest_freq_to_idx on public.quest_friend_requests (to_email, status);
create index if not exists quest_freq_from_idx on public.quest_friend_requests (from_email, status);
-- 같은 방향 대기 신청은 하나만
create unique index if not exists quest_freq_pending_uniq on public.quest_friend_requests (from_email, to_email) where status = 'pending';

-- ---------- 파티 ----------
-- members [{e, j(가입일 KST)}], invites [{e, by, at}] 구조는 n8n 로직을 그대로 쓰기 위해 jsonb로 유지
create table if not exists public.quest_parties (
  party_id     text primary key,
  name         text not null default '파티',
  emoji        text not null default '⚔️',
  goal         text not null default 'perfect' check (goal in ('perfect', 'rate80')),
  leader_email text not null default '',
  members      jsonb not null default '[]' check (jsonb_typeof(members) = 'array'),
  invites      jsonb not null default '[]' check (jsonb_typeof(invites) = 'array'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists quest_parties_members_gin on public.quest_parties using gin (members jsonb_path_ops);
create index if not exists quest_parties_invites_gin on public.quest_parties using gin (invites jsonb_path_ops);

create table if not exists public.quest_party_clears (
  party_id   text not null references public.quest_parties(party_id) on delete cascade,
  clear_date date not null,
  members    jsonb not null default '[]' check (jsonb_typeof(members) = 'array'),  -- ["email", ...]
  xp         integer not null default 0,
  combo      integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (party_id, clear_date)
);
create index if not exists quest_party_clears_members_gin on public.quest_party_clears using gin (members jsonb_path_ops);

-- ---------- 랭킹 뷰 ----------
-- 이번 주(월요일 시작, KST) 주간 XP·이번 달 시즌 XP 기준 공개 랭킹. 지난 주 스냅샷은 0으로 본다(프론트 playerVal과 동일).
create or replace view public.quest_league_board
with (security_invoker = true) as
with k as (
  select to_char(date_trunc('week', now() at time zone 'Asia/Seoul'), 'YYYY-MM-DD') as ws,
         to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM') as month
)
select m.email, m.name, m.friend_code, m.league_uid, m.photo, m.hidden, m.created_at,
       greatest(coalesce(s.level, 1), 1)::int as level,
       case when s.week_key = k.ws then s.week_xp else 0 end::int as week_xp,
       case when s.season_key = k.month then s.season_xp else 0 end::int as season_xp,
       rank() over (order by case when s.week_key = k.ws then s.week_xp else 0 end desc)::int as week_rank
from public.quest_members m
cross join k
left join public.quest_stats s on s.email = m.email
where m.active;

-- 전체 리그 대상: 나 + 내 친구(비공개여도) + 공개 회원을 이번 주 XP 순으로 max_rows명.
-- 비공개(hidden) 규칙을 n8n 코드가 아니라 DB 함수에서 강제한다.
create or replace function public.quest_global_league(viewer text, max_rows int default 300)
returns table (email text, name text, friend_code text, league_uid text, photo text,
               is_friend boolean, is_me boolean, week_xp int, week_rank int)
language sql stable security definer set search_path = public as $$
  with v as (select lower(trim(coalesce(viewer, ''))) as e),
  f as (select fr.friend_email from public.quest_friends fr, v where fr.email = v.e)
  select b.email, b.name, b.friend_code, b.league_uid, b.photo,
         b.email in (select friend_email from f) as is_friend,
         b.email = v.e as is_me,
         b.week_xp, b.week_rank
  from public.quest_league_board b, v
  where v.e <> ''
    and (b.email = v.e or b.email in (select friend_email from f) or not b.hidden)
  order by (b.email = v.e) desc, (b.email in (select friend_email from f)) desc, b.week_xp desc, b.created_at
  limit greatest(1, least(coalesce(max_rows, 300), 1000))
$$;

-- 소셜 API 한 번 호출에 필요한 회원만 고르는 함수 (전체 회원을 읽지 않기 위함)
-- 나, 내 친구, 요청 payload가 가리키는 사람(코드·uid·이메일), 관련 파티원·초대자, 친구 신청 상대, 최근 응원 보낸 사람
create or replace function public.quest_social_ctx(viewer text, payload jsonb)
returns table (email text)
language sql stable security definer set search_path = public as $$
  with v as (select lower(trim(coalesce(viewer, ''))) as e),
  p as (select coalesce(payload, '{}'::jsonb) as j),
  codes as (
    select upper(trim(x)) as c from p, lateral (
      select p.j ->> 'code' union all select p.j ->> 'to'
      union all select jsonb_array_elements_text(case when jsonb_typeof(p.j -> 'invite') = 'array' then p.j -> 'invite' else '[]'::jsonb end)
    ) t(x) where x is not null and x <> ''
  ),
  pt as (
    select qp.* from public.quest_parties qp, v, p
    where (v.e <> '' and (qp.members @> jsonb_build_array(jsonb_build_object('e', v.e))
                       or qp.invites @> jsonb_build_array(jsonb_build_object('e', v.e))))
       or qp.party_id = (p.j ->> 'party_id')
  ),
  emails as (
    select v.e from v where v.e <> ''
    union select fr.friend_email from public.quest_friends fr, v where fr.email = v.e
    union select m.email from public.quest_members m where m.friend_code in (select c from codes)
    union select m.email from public.quest_members m, p where m.league_uid = (p.j ->> 'to')
    union select lower(trim(p.j ->> 'email')) from p where coalesce(p.j ->> 'email', '') <> ''
    union select x ->> 'e' from pt, jsonb_array_elements(pt.members) x
    union select x ->> 'e' from pt, jsonb_array_elements(pt.invites) x
    union select x ->> 'by' from pt, jsonb_array_elements(pt.invites) x
    union select pt.leader_email from pt
    union select case when r.from_email = v.e then r.to_email else r.from_email end
          from public.quest_friend_requests r, v where v.e <> '' and (r.from_email = v.e or r.to_email = v.e)
    union select c.from_email from (
      select ch.from_email from public.quest_cheers ch, v where ch.to_email = v.e order by ch.created_at desc limit 30
    ) c
  )
  select distinct e from emails where e is not null and e <> ''
$$;

comment on table public.quest_members is 'Runner Quest 회원. 인증 세션(dl_sessions)·패스키는 n8n data table에 남아 있음';
comment on view public.quest_league_board is '활성 회원별 이번 주·이번 시즌 XP와 주간 순위 (비공개 필터 전)';
comment on function public.quest_global_league(text, int) is '전체 리그 목록. 비공개 회원은 친구에게만 노출';
