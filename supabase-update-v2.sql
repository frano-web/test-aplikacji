-- PLANER v2 update for an EXISTING Supabase project.
-- Run this once in Supabase -> SQL Editor if the older PLANER schema is already installed.

begin;

-- 1) Invite codes: athletes get one shared 24h multi-use code; other roles remain one-time.
alter table public.invite_codes add column if not exists use_count integer not null default 0;
alter table public.invite_codes add column if not exists max_uses integer;

update public.invite_codes
set use_count = 1, max_uses = 1
where used_at is not null;

update public.invite_codes
set max_uses = 1
where max_uses is null and role <> 'athlete';

update public.invite_codes
set expires_at = least(coalesce(expires_at, now() + interval '24 hours'), now() + interval '24 hours')
where role='athlete' and used_at is null;

alter table public.invite_codes alter column max_uses set default 1;

-- 2) Chat read state / unread counters.
create table if not exists public.chat_reads (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key(group_id, user_id)
);
alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from anon, authenticated;

-- 3) Trip visibility helpers. Athlete can only see trips to which they are assigned.
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=auth.uid());
$$;

create or replace function public.can_view_trip(p_trip_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_planer_role() in ('admin','coach','mechanic','driver'), false)
      or public.is_trip_member(p_trip_id);
$$;

-- 4) Signup claim logic.
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
  if v_name is null then raise exception 'Brak imienia i nazwiska.'; end if;

  select * into v_invite
  from public.invite_codes
  where code=v_code
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses)
  for update;

  if not found then raise exception 'Kod dostępu jest nieprawidłowy, wykorzystany lub wygasł.'; end if;

  insert into public.profiles(id,full_name,role) values(new.id,v_name,v_invite.role);
  insert into public.directory(id,full_name) values(new.id,v_name);

  update public.invite_codes
  set use_count=use_count+1,
      used_by=new.id,
      used_at=case when max_uses is not null and use_count+1>=max_uses then now() else used_at end
  where id=v_invite.id;

  return new;
end;
$$;

create or replace function public.generate_invite_code(p_role public.planer_role, p_expires_hours integer default 168)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_code text; v_hours integer; v_max integer;
begin
  if not public.is_planer_admin() then raise exception 'Brak uprawnień'; end if;
  v_hours := case when p_role='athlete' then 24 else greatest(1,coalesce(p_expires_hours,168)) end;
  v_max := case when p_role='athlete' then null else 1 end;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    begin
      insert into public.invite_codes(code,role,created_by,expires_at,max_uses)
      values(v_code,p_role,auth.uid(),now()+make_interval(hours=>v_hours),v_max);
      return v_code;
    exception when unique_violation then null;
    end;
  end loop;
end;
$$;

-- 5) Reliable announcement read marker.
create or replace function public.mark_announcement_read(p_announcement_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Brak sesji'; end if;
  if not exists(
    select 1 from public.announcements a
    where a.id=p_announcement_id and (a.trip_id is null or public.can_view_trip(a.trip_id))
  ) then raise exception 'Brak dostępu do komunikatu.'; end if;
  insert into public.announcement_reads(announcement_id,user_id)
  values(p_announcement_id,auth.uid()) on conflict do nothing;
end;
$$;

-- 6) Chat unread counters.
create or replace function public.mark_chat_read(p_group_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_chat_member(p_group_id) then raise exception 'Brak dostępu do czatu.'; end if;
  insert into public.chat_reads(group_id,user_id,last_read_at)
  values(p_group_id,auth.uid(),now())
  on conflict(group_id,user_id) do update set last_read_at=excluded.last_read_at;
end;
$$;

create or replace function public.get_chat_unread_counts()
returns table(group_id uuid, unread_count bigint)
language sql stable security definer set search_path=public as $$
  select cm.group_id, count(m.id)::bigint
  from public.chat_members cm
  left join public.chat_reads cr on cr.group_id=cm.group_id and cr.user_id=cm.user_id
  left join public.messages m on m.group_id=cm.group_id
    and m.sender_id<>auth.uid()
    and m.created_at>coalesce(cr.last_read_at,cm.joined_at)
  where cm.user_id=auth.uid()
  group by cm.group_id;
$$;

grant execute on function public.generate_invite_code(public.planer_role, integer) to authenticated;
grant execute on function public.mark_announcement_read(uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;
grant execute on function public.get_chat_unread_counts() to authenticated;
revoke execute on function public.mark_announcement_read(uuid) from public, anon;
revoke execute on function public.mark_chat_read(uuid) from public, anon;
revoke execute on function public.get_chat_unread_counts() from public, anon;

-- 7) Replace visibility policies.
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select to authenticated using (public.can_view_trip(id));

drop policy if exists tv_select on public.trip_vehicles;
create policy tv_select on public.trip_vehicles for select to authenticated using (public.can_view_trip(trip_id));

drop policy if exists stops_select on public.pickup_stops;
create policy stops_select on public.pickup_stops for select to authenticated using (
  exists(select 1 from public.trip_vehicles tv where tv.id=trip_vehicle_id and public.can_view_trip(tv.trip_id))
);

drop policy if exists tm_select on public.trip_members;
create policy tm_select on public.trip_members for select to authenticated using (
  user_id=auth.uid() or public.is_planer_staff() or public.current_planer_role()='mechanic' or
  exists(select 1 from public.trip_vehicles tv where tv.id=trip_vehicle_id and tv.driver_id=auth.uid())
);

drop policy if exists ce_select on public.calendar_events;
create policy ce_select on public.calendar_events for select to authenticated using (
  trip_id is null or public.can_view_trip(trip_id)
);

drop policy if exists shop_select on public.shopping_items;
create policy shop_select on public.shopping_items for select to authenticated using (public.can_view_trip(trip_id));

drop policy if exists shop_insert on public.shopping_items;
create policy shop_insert on public.shopping_items for insert to authenticated with check (
  created_by=auth.uid() and public.can_view_trip(trip_id)
  and exists(select 1 from public.trips t where t.id=trip_id and t.shopping_enabled)
);

drop policy if exists ann_select on public.announcements;
create policy ann_select on public.announcements for select to authenticated using (
  trip_id is null or public.can_view_trip(trip_id)
);

drop policy if exists docs_select on public.documents;
create policy docs_select on public.documents for select to authenticated using (
  public.current_planer_role()<>'athlete' and (visible_to_members or public.is_planer_staff())
);

-- Mechanic can be assigned as a driver. Existing stop update policy already checks driver_id,
-- so a mechanic assigned as the driver can mark pickup stops as completed.

drop policy if exists planer_files_read on storage.objects;
create policy planer_files_read on storage.objects for select to authenticated
using (
  bucket_id='planer-files'
  and public.current_planer_role()<>'athlete'
  and exists(select 1 from public.documents d where d.storage_path=name and (d.visible_to_members or public.is_planer_staff()))
);

commit;
