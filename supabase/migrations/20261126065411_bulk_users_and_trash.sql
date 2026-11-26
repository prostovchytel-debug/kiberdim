alter table public.kd_users add column deleted_at timestamptz, add column import_key uuid unique;
alter table public.kd_catalog add column deleted_at timestamptz;
alter table public.kd_tests add column deleted_at timestamptz;

-- Serialize administrative changes and reject references to deleted records.
-- Tests, attempts and scores remain intact when an account is moved to trash.
create function public.kd_reference_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(8341201);
 if tg_table_name='kd_users' then
  if new.deleted_at is not null then return new;end if;
  if exists(select 1 from public.kd_catalog c where c.deleted_at is not null and
    ((c.kind='class' and c.name=new.class_name) or (c.kind='subject' and c.name=any(new.subjects)))) then
   raise exception 'Спочатку відновіть клас або предмет у довіднику.';
  end if;
 elsif tg_table_name='kd_tests' then
  if new.deleted_at is not null then return new;end if;
  if exists(select 1 from public.kd_catalog where kind='subject' and name=new.data->>'subject' and deleted_at is not null) then raise exception 'Спочатку відновіть предмет.';end if;
 elsif tg_table_name='kd_sessions' then
  if exists(select 1 from public.kd_users where id=new.owner and deleted_at is not null) or exists(select 1 from public.kd_tests where id=new.test_id and deleted_at is not null) then raise exception 'Користувача або тест видалено.';end if;
  if exists(select 1 from public.kd_catalog c where c.deleted_at is not null and ((c.kind='subject' and c.name=new.subject) or (c.kind='class' and c.name=any(new.classes)))) then raise exception 'Клас або предмет видалено.';end if;
 end if;
 return new;
end $$;
create trigger kd_users_refs before insert or update of class_name,subjects,deleted_at on public.kd_users for each row execute function public.kd_reference_guard();
create trigger kd_tests_refs before insert or update of data,deleted_at on public.kd_tests for each row execute function public.kd_reference_guard();
create trigger kd_sessions_refs before insert on public.kd_sessions for each row execute function public.kd_reference_guard();

create function public.kd_trash(p_actor uuid,p_kind text,p_id uuid,p_restore boolean default false) returns void language plpgsql security invoker set search_path='' as $$
declare a public.kd_users; u public.kd_users; c public.kd_catalog; t public.kd_tests; stamp timestamptz;
begin
 perform pg_advisory_xact_lock(8341201);
 select * into a from public.kd_users where id=p_actor and not blocked and deleted_at is null and not must_change;
 if a.id is null then raise exception 'Потрібна авторизація.';end if;
 stamp=case when p_restore then null else now() end;
 if p_kind='user' then
  if a.role<>'admin' or p_id=p_actor then raise exception 'Не можна видаляти власний акаунт. Дія доступна адміністратору.';end if;
  select * into u from public.kd_users where id=p_id for update;
  if u.id is null or u.role='admin' then raise exception 'Адміністратора не можна видалити.';end if;
  if not p_restore and exists(select 1 from public.kd_sessions s where s.status in ('active','paused') and (s.owner=p_id or exists(select 1 from public.kd_attempts x where x.session_id=s.id and x.user_id=p_id and not x.done))) then raise exception 'Спочатку завершіть активне тестування цього користувача.';end if;
  update public.kd_users set deleted_at=stamp,auth_version=auth_version+1 where id=p_id;
  delete from public.kd_auth where user_id=p_id;
 elsif p_kind='catalog' then
  if a.role<>'admin' then raise exception 'Лише адміністратор.';end if;
  select * into c from public.kd_catalog where id=p_id for update;
  if c.id is null then raise exception 'Запис не знайдено.';end if;
  if not p_restore then
   if exists(select 1 from public.kd_users where deleted_at is null and ((c.kind='class' and class_name=c.name) or (c.kind='subject' and c.name=any(subjects)))) then raise exception 'Цей клас або предмет використовується в профілях. Змініть прив’язку або видаліть відповідних користувачів.';end if;
   if c.kind='subject' and exists(select 1 from public.kd_tests where deleted_at is null and data->>'subject'=c.name) then raise exception 'Предмет використовується в тестах. Змініть предмет тестів або перемістіть їх у видалені.';end if;
   if exists(select 1 from public.kd_sessions where status in ('active','paused') and ((c.kind='class' and c.name=any(classes)) or (c.kind='subject' and subject=c.name))) then raise exception 'Спочатку завершіть активні сеанси цього класу або предмета.';end if;
  end if;
  update public.kd_catalog set deleted_at=stamp where id=p_id;
 elsif p_kind='test' then
  if a.role not in ('admin','teacher') then raise exception 'Потрібен вхід учителя.';end if;
  select * into t from public.kd_tests where id=p_id and owner=p_actor for update;
  if t.id is null then raise exception 'Тест не знайдено.';end if;
  if not p_restore and exists(select 1 from public.kd_sessions where test_id=p_id and status in ('active','paused')) then raise exception 'Спочатку завершіть активні сеанси тесту.';end if;
  update public.kd_tests set deleted_at=stamp where id=p_id;
 else raise exception 'Невідомий тип запису.';
 end if;
 insert into public.kd_audit(actor,action,target) values(p_actor,(case when p_restore then 'restore-' else 'trash-' end)||p_kind,p_id);
end $$;

-- One small batch is atomic. import_key makes uncertain/repeated requests idempotent.
create function public.kd_import_users(p_actor uuid,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; u public.kd_users; subj text[]; item text; outrows jsonb='[]'::jsonb;
begin
 perform pg_advisory_xact_lock(8341201);
 if not exists(select 1 from public.kd_users where id=p_actor and role='admin' and not blocked and deleted_at is null and not must_change) then raise exception 'Лише адміністратор.';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 5 then raise exception 'Пакет: 1–5 записів.';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  subj=array(select jsonb_array_elements_text(r->'subjects'));
  if r->>'role' not in ('student','teacher') or r->>'login' !~ '^[a-z0-9_.@-]{3,80}$' or length(r->>'name') not between 3 and 100 then raise exception 'Перевірте дані імпорту.';end if;
  select * into u from public.kd_users where import_key=(r->>'importKey')::uuid;
  if u.id is not null then
   if u.deleted_at is not null or u.login<>r->>'login' or u.name<>r->>'name' or u.role<>r->>'role' or u.class_name<>r->>'className' or u.subjects<>subj then raise exception 'Рядок імпорту вже був використаний для інших даних.';end if;
  else
   if r->>'password_hash' !~ '^[a-f0-9-]+:[a-f0-9]{64}$' then raise exception 'Відсутній захищений пароль.';end if;
   if r->>'role'='student' then
    if length(r->>'className') not between 1 and 30 then raise exception 'Перевірте клас.';end if;
    insert into public.kd_catalog(kind,name) values('class',r->>'className') on conflict(kind,name) do nothing;
   else
    if cardinality(subj) not between 1 and 40 then raise exception 'Перевірте предмети.';end if;
    foreach item in array subj loop
     if length(item) not between 1 and 100 then raise exception 'Перевірте назву предмета.';end if;
     insert into public.kd_catalog(kind,name) values('subject',item) on conflict(kind,name) do nothing;
    end loop;
   end if;
   insert into public.kd_users(login,name,role,class_name,subjects,password_hash,iterations,must_change,import_key)
    values(r->>'login',r->>'name',r->>'role',r->>'className',subj,r->>'password_hash',600000,true,(r->>'importKey')::uuid) returning * into u;
   insert into public.kd_audit(actor,action,target) values(p_actor,'import-user',u.id);
  end if;
  outrows=outrows||jsonb_build_array(jsonb_build_object('id',u.id,'importKey',u.import_key,'login',u.login));
 end loop;
 return outrows;
end $$;
revoke all on function public.kd_reference_guard(), public.kd_trash(uuid,text,uuid,boolean), public.kd_import_users(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kd_reference_guard(), public.kd_trash(uuid,text,uuid,boolean), public.kd_import_users(uuid,jsonb) to service_role;
