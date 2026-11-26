begin;
do $$
declare u uuid:=gen_random_uuid();other uuid:=gen_random_uuid();t uuid:=gen_random_uuid();s uuid:=gen_random_uuid();a uuid:=gen_random_uuid();snapshot jsonb:='{"questions":[],"answers":[{"points":3}],"index":1}';blocked boolean;
begin
insert into public.kd_users(id,login,name,role,password_hash) values(u,'qa-'||u,'QA Teacher','teacher','unused'),(other,'qa-'||other,'Other Teacher','teacher','unused');
insert into public.kd_tests(id,owner,data) values(t,u,'{}');
insert into public.kd_sessions(id,owner,test_id,code,title,subject,classes,data,status) values(s,u,t,'000000','QA','QA','{QA}','{}','closed');
insert into public.kd_attempts(id,session_id,token_hash,name,class_name,data,done) values(a,s,'qa-'||a,'QA Student','QA',snapshot,true);
blocked:=false;begin perform public.kd_trash_result(other,'result',a,false);exception when others then blocked:=true;end;if not blocked then raise exception 'Ownership bypass';end if;
perform public.kd_trash_result(u,'result',a,false);
if (select deleted_at is null or data<>snapshot from public.kd_attempts where id=a) then raise exception 'Result deletion damaged data';end if;
perform public.kd_trash_result(u,'session',s,false);
blocked:=false;begin perform public.kd_trash_result(u,'result',a,true);exception when others then blocked:=true;end;if not blocked then raise exception 'Restored child of deleted session';end if;
perform public.kd_trash_result(u,'session',s,true);
if (select deleted_at is null from public.kd_attempts where id=a) then raise exception 'Session restore revived independently deleted result';end if;
perform public.kd_trash_result(u,'result',a,true);
if (select deleted_at is not null or data<>snapshot from public.kd_attempts where id=a) then raise exception 'Restore failed';end if;
update public.kd_sessions set status='active' where id=s;
blocked:=false;begin perform public.kd_trash_result(u,'session',s,false);exception when others then blocked:=true;end;if not blocked then raise exception 'Deleted live session';end if;
update public.kd_attempts set done=false where id=a;
blocked:=false;begin perform public.kd_trash_result(u,'result',a,false);exception when others then blocked:=true;end;if not blocked then raise exception 'Deleted ongoing attempt';end if;
if has_function_privilege('anon','public.kd_trash_result(uuid,text,uuid,boolean)','execute') or has_function_privilege('authenticated','public.kd_trash_result(uuid,text,uuid,boolean)','execute') then raise exception 'Public delete access';end if;
end $$;
rollback;
