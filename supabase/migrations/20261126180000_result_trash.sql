alter table public.kd_sessions add column deleted_at timestamptz;
alter table public.kd_attempts add column deleted_at timestamptz;
create function public.kd_trash_result(p_actor uuid,p_kind text,p_id uuid,p_restore boolean default false) returns void language plpgsql security invoker set search_path='' as $$
declare s public.kd_sessions;a public.kd_attempts;
begin
 if not exists(select 1 from public.kd_users where id=p_actor and role in ('admin','teacher') and not blocked and deleted_at is null) then raise exception 'Потрібен вхід учителя.';end if;
 if p_kind='session' then
  select * into s from public.kd_sessions where id=p_id and owner=p_actor for update;
 elsif p_kind='result' then
  select s0.* into s from public.kd_sessions s0 join public.kd_attempts a0 on a0.session_id=s0.id where a0.id=p_id and s0.owner=p_actor for update of s0;
 else raise exception 'Невідомий тип запису.';end if;
 if s.id is null then raise exception 'Запис не знайдено або належить іншому вчителю.';end if;
 if p_kind='session' then
  if s.status in ('active','paused') then raise exception 'Спочатку завершіть або скасуйте сеанс.';end if;
  update public.kd_sessions set deleted_at=case when p_restore then null else coalesce(deleted_at,now()) end,revision=revision+1 where id=s.id;
 else
  if s.deleted_at is not null then raise exception 'Спочатку відновіть сеанс.';end if;
  select * into a from public.kd_attempts where id=p_id for update;
  if not a.done and s.status in ('active','paused') then raise exception 'Учень ще проходить тест. Дочекайтеся завершення роботи або завершіть сеанс.';end if;
  update public.kd_attempts set deleted_at=case when p_restore then null else coalesce(deleted_at,now()) end,revision=revision+1 where id=a.id;
 end if;
 insert into public.kd_audit(actor,action,target) values(p_actor,(case when p_restore then 'restore-' else 'trash-' end)||p_kind,p_id);
end $$;
revoke all on function public.kd_trash_result(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.kd_trash_result(uuid,text,uuid,boolean) to service_role;
