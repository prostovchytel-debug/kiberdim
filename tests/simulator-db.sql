begin;
set local role service_role;
do $$
declare a uuid; s uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); n text:='QA-'||s::text;
begin
 select id into a from public.kd_users where role='admin' and deleted_at is null limit 1;
 insert into public.kd_catalog(id,kind,name) values(c,'subject',n);
 insert into public.kd_simulators(id,owner,title,classes,subjects,html,filename) values(s,a,'QA',array['2','3'],array[n],'<!doctype html><title>QA</title>','qa.html');
 begin
  update public.kd_catalog set deleted_at=now() where id=c;
  raise exception 'QA: referenced subject deletion should fail';
 exception when raise_exception then
  if sqlerrm like 'QA:%' then raise; end if;
 end;
 update public.kd_simulators set title='Renamed',published=true where id=s;
 if (select html from public.kd_simulators where id=s) <> '<!doctype html><title>QA</title>' then raise exception 'QA: rename changed HTML'; end if;
 update public.kd_simulators set deleted_at=now() where id=s;
 update public.kd_catalog set deleted_at=now() where id=c;
 begin
  update public.kd_simulators set deleted_at=null where id=s;
  raise exception 'QA: restore with deleted subject should fail';
 exception when raise_exception then
  if sqlerrm like 'QA:%' then raise; end if;
 end;
 update public.kd_catalog set deleted_at=null where id=c;
 update public.kd_simulators set deleted_at=null where id=s;
 if has_table_privilege('anon','public.kd_simulators','SELECT') or has_table_privilege('authenticated','public.kd_simulators','INSERT') then raise exception 'QA: direct access must be denied'; end if;
end $$;
rollback;
select 'PASS: simulator persistence, rename, restore and subject dependencies' result;
