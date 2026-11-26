create table public.kd_simulators (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references public.kd_users(id),
 title text not null check(length(title) between 1 and 120),
 classes text[] not null check(cardinality(classes) between 1 and 12 and classes <@ array['1','2','3','4','5','6','7','8','9','10','11','12']),
 subjects text[] not null check(cardinality(subjects) between 1 and 100),
 topic text not null default '' check(length(topic)<=120),
 description text not null default '' check(length(description)<=500),
 html text not null check(octet_length(html) between 1 and 2097152),
 filename text not null check(length(filename) between 1 and 160),
 published boolean not null default false,
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.kd_simulators enable row level security;
revoke all on public.kd_simulators from public,anon,authenticated;
grant all on public.kd_simulators to service_role;
create index kd_simulators_visible on public.kd_simulators(updated_at desc) where published and deleted_at is null;
-- Catalog names are kept as snapshots, as for tests and historical reports.
-- Published simulators block catalog removal; archived ones retain their tags.
create function public.kd_simulator_catalog_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(8341201);
 if tg_table_name='kd_simulators' then
  if new.deleted_at is null then
   if not exists(select 1 from public.kd_users where id=new.owner and role='admin' and deleted_at is null) then raise exception 'Додавати симулятори може лише адміністратор.'; end if;
   if exists(select 1 from unnest(new.subjects) n where not exists(select 1 from public.kd_catalog c where c.kind='subject' and c.name=n and c.deleted_at is null)) then raise exception 'Спочатку додайте або відновіть предмети симулятора.'; end if;
  end if;
 elsif tg_table_name='kd_catalog' then
  if new.deleted_at is not null and old.deleted_at is null and exists(select 1 from public.kd_simulators s where s.deleted_at is null and (new.kind='subject' and new.name=any(s.subjects))) then raise exception 'Запис використовується в симуляторах. Спочатку змініть їхні предмети або видаліть симулятори.'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.kd_simulator_catalog_guard() from public,anon,authenticated;
grant execute on function public.kd_simulator_catalog_guard() to service_role;
create trigger kd_simulator_refs before insert or update of classes,subjects,deleted_at on public.kd_simulators for each row execute function public.kd_simulator_catalog_guard();
create trigger kd_catalog_simulator_refs before update of deleted_at on public.kd_catalog for each row execute function public.kd_simulator_catalog_guard();
