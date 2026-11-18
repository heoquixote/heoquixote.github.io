-- Runner Quest: 친구에게 아이템 선물하기 (상점 🎁 선물하기)
-- 보낸 사람의 골드 차감은 앱의 profile.shop.buys에 남고, 이 테이블은 "누가 누구에게 무엇을 보냈고 받았는지"만 기록한다.
-- 받는 사람 앱이 league 응답의 미수령 선물을 profile.shop.gifts에 넣은 뒤 gifts_claim으로 claimed_at을 채운다.
-- 실행: Supabase 대시보드 > SQL Editor 에서 이 파일 하나만 실행 (다시 실행해도 안전).

create table if not exists public.quest_gifts (
  gift_id    text primary key check (gift_id ~ '^g[a-z0-9]{6,24}$'),   -- 앱이 만든 id (재전송해도 중복 저장 안 됨)
  from_email text not null references public.quest_members(email) on delete cascade,
  to_email   text not null references public.quest_members(email) on delete cascade,
  item       text not null check (item in ('shield', 'rshield', 'ext', 'boost', 'potion')),
  message    text not null default '' check (length(message) <= 40),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  check (from_email <> to_email)
);
create index if not exists quest_gifts_unclaimed_idx on public.quest_gifts (to_email, created_at) where claimed_at is null;
create index if not exists quest_gifts_from_idx on public.quest_gifts (from_email, created_at desc);

grant select, insert, update (claimed_at) on public.quest_gifts to n8n_quest;
revoke all on public.quest_gifts from anon, authenticated;
alter table public.quest_gifts enable row level security;

-- 친구 사이에서만 보낼 수 있고(DB에서 한 번 더 확인), 하루(KST) 3번까지
drop policy if exists n8n_select on public.quest_gifts;
create policy n8n_select on public.quest_gifts for select to n8n_quest using (true);
drop policy if exists n8n_insert on public.quest_gifts;
create policy n8n_insert on public.quest_gifts for insert to n8n_quest with check (
  claimed_at is null
  and exists (select 1 from public.quest_friends f where f.email = from_email and f.friend_email = to_email)
  and (select count(*) from public.quest_gifts g
       where g.from_email = quest_gifts.from_email
         and g.created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') < 3
);
-- 받음 처리만 (한 번 받은 선물은 되돌리지 않음)
drop policy if exists n8n_update on public.quest_gifts;
create policy n8n_update on public.quest_gifts for update to n8n_quest using (claimed_at is null) with check (claimed_at is not null);

comment on table public.quest_gifts is '친구 선물 기록. 골드 차감은 보낸 사람 profile.shop.buys(kind gift), 받은 아이템은 받은 사람 profile.shop.gifts';
