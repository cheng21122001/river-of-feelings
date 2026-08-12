-- 日课记录。字段与 entries 表一一对应，命名规则相同。
-- 在 Supabase 控制台的 SQL Editor 里执行。

create table if not exists public.daily_logs (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  id         text        not null,
  date       text        not null,
  ts         bigint      not null,
  item       text        not null,
  edited_ts  bigint,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists daily_logs_updated_at_idx
  on public.daily_logs (updated_at);

-- 行级权限是安全的关键：anon key 是公开值，谁都拿得到，
-- 但策略限定「只能读写 auth.uid() 等于自己的行」。
alter table public.daily_logs enable row level security;

drop policy if exists "daily_logs own select" on public.daily_logs;
drop policy if exists "daily_logs own insert" on public.daily_logs;
drop policy if exists "daily_logs own update" on public.daily_logs;
drop policy if exists "daily_logs own delete" on public.daily_logs;

create policy "daily_logs own select" on public.daily_logs
  for select using (auth.uid() = user_id);
create policy "daily_logs own insert" on public.daily_logs
  for insert with check (auth.uid() = user_id);
create policy "daily_logs own update" on public.daily_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_logs own delete" on public.daily_logs
  for delete using (auth.uid() = user_id);

-- 每次写入自动更新 updated_at，同步游标靠它推进。
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists daily_logs_touch on public.daily_logs;
create trigger daily_logs_touch
  before insert or update on public.daily_logs
  for each row execute function public.touch_updated_at();
