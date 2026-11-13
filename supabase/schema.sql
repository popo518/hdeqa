-- حديقتي: جدول مزامنة نسخة الحديقة للمستخدم المصادق عليه فقط.
-- شغّل هذا الملف في SQL Editor داخل مشروع Supabase الخاص بك.
-- لا تضع service_role key في ملفات الواجهة أو مستودع GitHub.

create table if not exists public.garden_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.garden_sync enable row level security;

revoke all on table public.garden_sync from anon;
grant select, insert, update, delete on table public.garden_sync to authenticated;

drop policy if exists "read own garden snapshot" on public.garden_sync;
create policy "read own garden snapshot"
  on public.garden_sync for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "insert own garden snapshot" on public.garden_sync;
create policy "insert own garden snapshot"
  on public.garden_sync for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "update own garden snapshot" on public.garden_sync;
create policy "update own garden snapshot"
  on public.garden_sync for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own garden snapshot" on public.garden_sync;
create policy "delete own garden snapshot"
  on public.garden_sync for delete
  to authenticated
  using (auth.uid() = user_id);
