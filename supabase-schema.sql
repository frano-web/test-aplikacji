-- PLANER / Supabase database schema
-- Run the whole file once in Supabase -> SQL Editor.
-- Then run the BOOTSTRAP section at the end to generate the first one-time admin code.

create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$ begin
  create type public.planer_role as enum ('admin','coach','athlete','mechanic','driver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.trip_status as enum ('draft','confirmed','cancelled','finished');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_trip_status as enum ('pending','going','not_going','maybe');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_status as enum ('open','in_progress','ready');
exception when duplicate_object then null; end $$;

-- ---------- Core identity ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.planer_role not null,
  phone text,
  emergency_contact text,
  license_no text,
  uci_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.directory (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  active boolean not null default true
);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  role public.planer_role not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz
);

-- ---------- Club / trips ----------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration text,
  seats integer not null default 5 check (seats between 1 and 60),
  bike_capacity integer not null default 0 check (bike_capacity between 0 and 60),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  status public.trip_status not null default 'draft',
  hotel_name text,
  hotel_address text,
  hotel_checkin text,
  hotel_breakfast text,
  hotel_checkout text,
  hotel_notes text,
  shopping_enabled boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_vehicles (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete set null,
  departure_time timestamptz,
  notes text,
  unique(trip_id, vehicle_id)
);

create table if not exists public.pickup_stops (
  id uuid primary key default gen_random_uuid(),
  trip_vehicle_id uuid not null references public.trip_vehicles(id) on delete cascade,
  label text not null,
  pickup_time timestamptz,
  sort_order integer not null default 0,
  completed_at timestamptz
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.member_trip_status not null default 'pending',
  trip_vehicle_id uuid references public.trip_vehicles(id) on delete set null,
  pickup_stop_id uuid references public.pickup_stops(id) on delete set null,
  pickup_custom text,
  pickup_note text,
  bike_status text not null default 'Brak danych',
  bike_count integer not null default 0 check (bike_count between 0 and 10),
  room text,
  admin_note text,
  updated_at timestamptz not null default now(),
  primary key(trip_id, user_id)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  type text not null default 'other',
  location text,
  description text,
  trip_id uuid references public.trips(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Bikes / service ----------
create table if not exists public.bikes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.service_tickets (
  id uuid primary key default gen_random_uuid(),
  bike_id uuid references public.bikes(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  description text not null,
  status public.service_status not null default 'open',
  mechanic_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Tasks / shopping ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  title text not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_role public.planer_role,
  due_at timestamptz,
  done boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  item text not null,
  quantity integer not null default 1 check (quantity between 1 and 999),
  done boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Announcements ----------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  title text not null,
  body text not null,
  important boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(announcement_id, user_id)
);

-- ---------- Chat ----------
create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'group' check (kind in ('group','direct','trip')),
  trip_id uuid references public.trips(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(group_id, user_id)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- ---------- Admin-only finances ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Files metadata ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  title text not null,
  storage_path text not null unique,
  visible_to_members boolean not null default true,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Helper functions ----------
create or replace function public.current_planer_role()
returns public.planer_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_planer_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_planer_role() = 'admin', false); $$;

create or replace function public.is_planer_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_planer_role() in ('admin','coach'), false); $$;

create or replace function public.is_chat_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.chat_members where group_id=p_group_id and user_id=auth.uid());
$$;

create or replace function public.is_chat_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.chat_groups where id=p_group_id and created_by=auth.uid());
$$;

-- Secure one-time invite claim during Auth signup.
create or replace function public.handle_new_planer_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_name text;
  v_invite public.invite_codes%rowtype;
begin
  v_code := upper(regexp_replace(coalesce(new.raw_user_meta_data->>'invite_code',''), '[^A-Z0-9]', '', 'g'));
  v_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), '');

  if v_name is null then
    raise exception 'Brak imienia i nazwiska.';
  end if;

  select * into v_invite
  from public.invite_codes
  where code = v_code
    and used_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Kod dostępu jest nieprawidłowy, wykorzystany lub wygasł.';
  end if;

  insert into public.profiles(id, full_name, role)
  values(new.id, v_name, v_invite.role);

  insert into public.directory(id, full_name)
  values(new.id, v_name);

  update public.invite_codes
  set used_at = now(), used_by = new.id
  where id = v_invite.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_planer on auth.users;
create trigger on_auth_user_created_planer
after insert on auth.users
for each row execute procedure public.handle_new_planer_user();

-- Keep directory name in sync without exposing private profile fields.
create or replace function public.sync_planer_directory()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.directory set full_name = new.full_name, active = new.active where id = new.id;
  return new;
end; $$;

drop trigger if exists profiles_sync_directory on public.profiles;
create trigger profiles_sync_directory after update of full_name,active on public.profiles
for each row execute procedure public.sync_planer_directory();

-- Generate a one-time access code. Admin only.
create or replace function public.generate_invite_code(p_role public.planer_role, p_expires_hours integer default 168)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
begin
  if not public.is_planer_admin() then raise exception 'Brak uprawnień'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    begin
      insert into public.invite_codes(code, role, created_by, expires_at)
      values(v_code, p_role, auth.uid(), case when p_expires_hours is null then null else now() + make_interval(hours => p_expires_hours) end);
      return v_code;
    exception when unique_violation then null;
    end;
  end loop;
end; $$;

-- Athlete/member updates only own allowed trip fields through RPC.
create or replace function public.set_my_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Brak sesji'; end if;
  update public.tasks
  set done=p_done
  where id=p_task_id
    and (public.is_planer_staff() or assigned_to=auth.uid() or assigned_role=public.current_planer_role());
  if not found then raise exception 'Brak uprawnień do zadania.'; end if;
end; $$;

create or replace function public.update_my_trip_response(
  p_trip_id uuid,
  p_status public.member_trip_status,
  p_pickup_stop_id uuid default null,
  p_pickup_custom text default null,
  p_pickup_note text default null,
  p_bike_status text default 'Brak danych',
  p_bike_count integer default 0
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Brak sesji'; end if;
  update public.trip_members
  set status=p_status,
      pickup_stop_id=p_pickup_stop_id,
      pickup_custom=nullif(trim(p_pickup_custom),''),
      pickup_note=nullif(trim(p_pickup_note),''),
      bike_status=left(coalesce(p_bike_status,'Brak danych'),120),
      bike_count=greatest(0,least(coalesce(p_bike_count,0),10)),
      updated_at=now()
  where trip_id=p_trip_id and user_id=auth.uid();
  if not found then raise exception 'Nie jesteś przypisany do tego wyjazdu.'; end if;
end; $$;

-- Create chat and add selected members. Creator is always included.
create or replace function public.create_chat(p_name text, p_member_ids uuid[], p_trip_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid; v_uid uuid;
begin
  if auth.uid() is null then raise exception 'Brak sesji'; end if;
  insert into public.chat_groups(name, kind, trip_id, created_by)
  values(left(trim(p_name),80), case when p_trip_id is null then 'group' else 'trip' end, p_trip_id, auth.uid())
  returning id into v_id;
  insert into public.chat_members(group_id,user_id) values(v_id,auth.uid()) on conflict do nothing;
  foreach v_uid in array coalesce(p_member_ids,'{}'::uuid[]) loop
    if exists(select 1 from public.directory where id=v_uid and active) then
      insert into public.chat_members(group_id,user_id) values(v_id,v_uid) on conflict do nothing;
    end if;
  end loop;
  return v_id;
end; $$;


create or replace function public.create_direct_chat(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Brak sesji'; end if;
  if p_other_user=auth.uid() then raise exception 'Nie można utworzyć rozmowy ze sobą.'; end if;
  if not exists(select 1 from public.directory where id=p_other_user and active) then raise exception 'Nie znaleziono użytkownika.'; end if;

  select g.id into v_id
  from public.chat_groups g
  where g.kind='direct'
    and exists(select 1 from public.chat_members a where a.group_id=g.id and a.user_id=auth.uid())
    and exists(select 1 from public.chat_members b where b.group_id=g.id and b.user_id=p_other_user)
    and (select count(*) from public.chat_members c where c.group_id=g.id)=2
  limit 1;

  if v_id is null then
    insert into public.chat_groups(name,kind,created_by) values('Rozmowa prywatna','direct',auth.uid()) returning id into v_id;
    insert into public.chat_members(group_id,user_id) values(v_id,auth.uid()),(v_id,p_other_user);
  end if;
  return v_id;
end; $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.directory enable row level security;
alter table public.invite_codes enable row level security;
alter table public.vehicles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_vehicles enable row level security;
alter table public.pickup_stops enable row level security;
alter table public.trip_members enable row level security;
alter table public.calendar_events enable row level security;
alter table public.bikes enable row level security;
alter table public.service_tickets enable row level security;
alter table public.tasks enable row level security;
alter table public.shopping_items enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.chat_groups enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.expenses enable row level security;
alter table public.documents enable row level security;

-- Tight grants: anon gets no table access. Authenticated only gets explicit operations.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.directory to authenticated;
grant select on public.invite_codes to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trip_vehicles to authenticated;
grant select, insert, update, delete on public.pickup_stops to authenticated;
grant select, insert, update, delete on public.trip_members to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, update, delete on public.bikes to authenticated;
grant select, insert, update, delete on public.service_tickets to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert on public.announcement_reads to authenticated;
grant select, insert, update, delete on public.chat_groups to authenticated;
grant select, insert, delete on public.chat_members to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant usage, select on sequence public.messages_id_seq to authenticated;
grant execute on function public.generate_invite_code(public.planer_role, integer) to authenticated;
grant execute on function public.set_my_task_done(uuid, boolean) to authenticated;
grant execute on function public.update_my_trip_response(uuid, public.member_trip_status, uuid, text, text, text, integer) to authenticated;
grant execute on function public.create_chat(text, uuid[], uuid) to authenticated;
grant execute on function public.create_direct_chat(uuid) to authenticated;
revoke execute on function public.generate_invite_code(public.planer_role, integer) from public, anon;
revoke execute on function public.set_my_task_done(uuid, boolean) from public, anon;
revoke execute on function public.update_my_trip_response(uuid, public.member_trip_status, uuid, text, text, text, integer) from public, anon;
revoke execute on function public.create_chat(text, uuid[], uuid) from public, anon;
revoke execute on function public.create_direct_chat(uuid) from public, anon;

-- profiles: own profile; admin/coach can manage/read team profiles.
create policy profiles_select on public.profiles for select to authenticated
using (id=auth.uid() or public.is_planer_staff());
create policy profiles_update on public.profiles for update to authenticated
using (public.is_planer_admin())
with check (public.is_planer_admin());

-- directory deliberately contains only non-sensitive display data.
create policy directory_select on public.directory for select to authenticated using (true);

-- invites visible/admin manageable only by admin.
create policy invites_select on public.invite_codes for select to authenticated using (public.is_planer_admin());
create policy invites_insert on public.invite_codes for insert to authenticated with check (public.is_planer_admin());
create policy invites_update on public.invite_codes for update to authenticated using (public.is_planer_admin()) with check (public.is_planer_admin());
create policy invites_delete on public.invite_codes for delete to authenticated using (public.is_planer_admin());

-- vehicles
create policy vehicles_select on public.vehicles for select to authenticated using (true);
create policy vehicles_insert on public.vehicles for insert to authenticated with check (public.is_planer_admin());
create policy vehicles_update on public.vehicles for update to authenticated using (public.is_planer_admin()) with check (public.is_planer_admin());
create policy vehicles_delete on public.vehicles for delete to authenticated using (public.is_planer_admin());

-- trips
create policy trips_select on public.trips for select to authenticated using (true);
create policy trips_insert on public.trips for insert to authenticated with check (public.is_planer_staff());
create policy trips_update on public.trips for update to authenticated using (public.is_planer_staff()) with check (public.is_planer_staff());
create policy trips_delete on public.trips for delete to authenticated using (public.is_planer_admin());

-- trip vehicles and stops
create policy tv_select on public.trip_vehicles for select to authenticated using (true);
create policy tv_insert on public.trip_vehicles for insert to authenticated with check (public.is_planer_staff());
create policy tv_update on public.trip_vehicles for update to authenticated using (public.is_planer_staff()) with check (public.is_planer_staff());
create policy tv_delete on public.trip_vehicles for delete to authenticated using (public.is_planer_staff());

create policy stops_select on public.pickup_stops for select to authenticated using (true);
create policy stops_insert on public.pickup_stops for insert to authenticated with check (public.is_planer_staff());
create policy stops_update on public.pickup_stops for update to authenticated
using (public.is_planer_staff() or exists(select 1 from public.trip_vehicles tv where tv.id=trip_vehicle_id and tv.driver_id=auth.uid()))
with check (public.is_planer_staff() or exists(select 1 from public.trip_vehicles tv where tv.id=trip_vehicle_id and tv.driver_id=auth.uid()));
create policy stops_delete on public.pickup_stops for delete to authenticated using (public.is_planer_staff());

-- trip members: self, staff, or driver of assigned vehicle can read. Direct writes staff only.
create policy tm_select on public.trip_members for select to authenticated using (
  user_id=auth.uid() or public.is_planer_staff() or
  (public.current_planer_role()='driver' and exists(select 1 from public.trip_vehicles tv where tv.id=trip_vehicle_id and tv.driver_id=auth.uid()))
);
create policy tm_insert on public.trip_members for insert to authenticated with check (public.is_planer_staff());
create policy tm_update on public.trip_members for update to authenticated using (public.is_planer_staff()) with check (public.is_planer_staff());
create policy tm_delete on public.trip_members for delete to authenticated using (public.is_planer_staff());

-- calendar
create policy ce_select on public.calendar_events for select to authenticated using (true);
create policy ce_insert on public.calendar_events for insert to authenticated with check (public.is_planer_staff());
create policy ce_update on public.calendar_events for update to authenticated using (public.is_planer_staff()) with check (public.is_planer_staff());
create policy ce_delete on public.calendar_events for delete to authenticated using (public.is_planer_staff());

-- bikes / service
create policy bikes_select on public.bikes for select to authenticated using (owner_id=auth.uid() or public.current_planer_role() in ('admin','coach','mechanic'));
create policy bikes_insert on public.bikes for insert to authenticated with check (owner_id=auth.uid() or public.is_planer_staff());
create policy bikes_update on public.bikes for update to authenticated using (owner_id=auth.uid() or public.is_planer_staff()) with check (owner_id=auth.uid() or public.is_planer_staff());
create policy bikes_delete on public.bikes for delete to authenticated using (owner_id=auth.uid() or public.is_planer_admin());

create policy st_select on public.service_tickets for select to authenticated using (created_by=auth.uid() or public.current_planer_role() in ('admin','coach','mechanic'));
create policy st_insert on public.service_tickets for insert to authenticated with check (created_by=auth.uid());
create policy st_update on public.service_tickets for update to authenticated using (public.current_planer_role() in ('admin','coach','mechanic')) with check (public.current_planer_role() in ('admin','coach','mechanic'));
create policy st_delete on public.service_tickets for delete to authenticated using (public.is_planer_admin());

-- tasks
create policy tasks_select on public.tasks for select to authenticated using (public.is_planer_staff() or assigned_to=auth.uid() or assigned_role=public.current_planer_role());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_planer_staff());
create policy tasks_update on public.tasks for update to authenticated using (public.is_planer_staff()) with check (public.is_planer_staff());
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_planer_staff());

-- shopping: all authenticated can read. Add only if list active. Creator/staff can update; staff delete.
create policy shop_select on public.shopping_items for select to authenticated using (true);
create policy shop_insert on public.shopping_items for insert to authenticated with check (created_by=auth.uid() and exists(select 1 from public.trips t where t.id=trip_id and t.shopping_enabled));
create policy shop_update on public.shopping_items for update to authenticated using (created_by=auth.uid() or public.is_planer_staff()) with check (created_by=auth.uid() or public.is_planer_staff());
create policy shop_delete on public.shopping_items for delete to authenticated using (public.is_planer_staff() or created_by=auth.uid());

-- announcements
create policy ann_select on public.announcements for select to authenticated using (true);
create policy ann_insert on public.announcements for insert to authenticated with check (public.is_planer_staff());
create policy ann_update on public.announcements for update to authenticated using (public.is_planer_staff()) with check (public.is_planer_staff());
create policy ann_delete on public.announcements for delete to authenticated using (public.is_planer_staff());
create policy reads_select on public.announcement_reads for select to authenticated using (user_id=auth.uid() or public.is_planer_staff());
create policy reads_insert on public.announcement_reads for insert to authenticated with check (user_id=auth.uid());

-- chat
create policy cg_select on public.chat_groups for select to authenticated using (public.is_chat_member(id));
create policy cg_insert on public.chat_groups for insert to authenticated with check (created_by=auth.uid());
create policy cg_update on public.chat_groups for update to authenticated using (created_by=auth.uid() or public.is_planer_admin()) with check (created_by=auth.uid() or public.is_planer_admin());
create policy cg_delete on public.chat_groups for delete to authenticated using (created_by=auth.uid() or public.is_planer_admin());

create policy cm_select on public.chat_members for select to authenticated using (user_id=auth.uid() or public.is_chat_member(group_id));
create policy cm_insert on public.chat_members for insert to authenticated with check (public.is_chat_owner(group_id) or public.is_planer_admin());
create policy cm_delete on public.chat_members for delete to authenticated using (user_id=auth.uid() or public.is_chat_owner(group_id) or public.is_planer_admin());

create policy msg_select on public.messages for select to authenticated using (public.is_chat_member(group_id));
create policy msg_insert on public.messages for insert to authenticated with check (sender_id=auth.uid() and public.is_chat_member(group_id));
create policy msg_delete on public.messages for delete to authenticated using (sender_id=auth.uid() or public.is_planer_admin());

-- finances admin only
create policy exp_select on public.expenses for select to authenticated using (public.is_planer_admin());
create policy exp_insert on public.expenses for insert to authenticated with check (public.is_planer_admin());
create policy exp_update on public.expenses for update to authenticated using (public.is_planer_admin()) with check (public.is_planer_admin());
create policy exp_delete on public.expenses for delete to authenticated using (public.is_planer_admin());

-- document metadata: members see public docs, staff see all; staff upload metadata.
create policy docs_select on public.documents for select to authenticated using (visible_to_members or public.is_planer_staff());
create policy docs_insert on public.documents for insert to authenticated with check (public.is_planer_staff());
create policy docs_update on public.documents for update to authenticated using (public.is_planer_staff()) with check (public.is_planer_staff());
create policy docs_delete on public.documents for delete to authenticated using (public.is_planer_staff());

-- ---------- Storage ----------
insert into storage.buckets(id,name,public) values('planer-files','planer-files',false)
on conflict(id) do nothing;

drop policy if exists planer_files_read on storage.objects;
create policy planer_files_read on storage.objects for select to authenticated
using (bucket_id='planer-files' and exists(select 1 from public.documents d where d.storage_path=name and (d.visible_to_members or public.is_planer_staff())));

drop policy if exists planer_files_insert on storage.objects;
create policy planer_files_insert on storage.objects for insert to authenticated
with check (bucket_id='planer-files' and public.is_planer_staff());

drop policy if exists planer_files_delete on storage.objects;
create policy planer_files_delete on storage.objects for delete to authenticated
using (bucket_id='planer-files' and public.is_planer_staff());

-- ---------- Realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.shopping_items;
exception when duplicate_object then null; end $$;

-- ---------- BOOTSTRAP ----------
-- Run this SELECT AFTER the schema to create the FIRST administrator code.
-- It is one-time, contains only letters/numbers, and is not hard-coded.
-- Copy the returned code and use it on PLANER -> Pierwsze logowanie.
-- After the first admin account exists, create all future codes from the app.

-- insert into public.invite_codes(code, role)
-- values (upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)), 'admin')
-- returning code;
