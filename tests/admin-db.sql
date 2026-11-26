-- Run with execute_sql or psql. All fixtures are rolled back.
begin;
set local role service_role;
do $$
declare a uuid=gen_random_uuid(); s uuid; t uuid=gen_random_uuid(); sess uuid=gen_random_uuid(); k uuid=gen_random_uuid(); c uuid; r jsonb; rowdata jsonb; v integer; denied boolean;
begin
 insert into public.kd_users(id,login,name,role,password_hash,must_change) values(a,'qa_'||replace(a::text,'-',''),'Перевірка Адміністратора Тест','admin','x:'||repeat('a',64),false);
 rowdata=jsonb_build_object('importKey',k,'login','qa_'||replace(k::text,'-',''),'name','Тест Учня','role','student','className','QA-'||left(k::text,8),'subjects','[]'::jsonb,'password_hash','a:'||repeat('b',64));
 r=public.kd_import_users(a,jsonb_build_array(rowdata));s=(r->0->>'id')::uuid;
 if public.kd_import_users(a,jsonb_build_array(rowdata))->0->>'id'<>s::text then raise exception 'Retry not idempotent';end if;
 select id into c from public.kd_catalog where kind='class' and name=rowdata->>'className';
 if c is null then raise exception 'Missing auto-created class';end if;
 denied=false;begin perform public.kd_trash(s,'catalog',c,false);exception when others then denied=true;end;if not denied then raise exception 'Student deleted catalog';end if;
 denied=false;begin perform public.kd_trash(a,'user',a,false);exception when others then denied=true;end;if not denied then raise exception 'Self-deletion allowed';end if;
 denied=false;begin perform public.kd_trash(a,'catalog',c,false);exception when others then denied=true;end;if not denied then raise exception 'Referenced class deleted';end if;
 insert into public.kd_tests(id,owner,data) values(t,a,jsonb_build_object('subject','QA subject'));
 insert into public.kd_sessions(id,owner,test_id,code,title,subject,classes,data,status) values(sess,a,t,'000000','QA','QA subject',array[rowdata->>'className'],'{}','closed');
 insert into public.kd_attempts(session_id,token_hash,user_id,name,class_name,data,done) values(sess,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),s,'Тест Учня',rowdata->>'className','{}',true);
 insert into public.kd_auth(token_hash,user_id,version,expires_at) values(replace(gen_random_uuid()::text,'-',''),s,0,now()+interval '1 day');
 perform public.kd_trash(a,'user',s,false);
 if not exists(select 1 from public.kd_users where id=s and deleted_at is not null and auth_version=1) or exists(select 1 from public.kd_auth where user_id=s) then raise exception 'User was not revoked';end if;
 if not exists(select 1 from public.kd_attempts where user_id=s and done) then raise exception 'Score lost';end if;
 perform public.kd_trash(a,'catalog',c,false);
 denied=false;begin perform public.kd_trash(a,'user',s,true);exception when others then denied=true;end;if not denied then raise exception 'User restored into deleted class';end if;
 perform public.kd_trash(a,'catalog',c,true);perform public.kd_trash(a,'user',s,true);
 perform public.kd_trash(a,'test',t,false);
 if not exists(select 1 from public.kd_sessions where id=sess) then raise exception 'Session lost';end if;
 perform public.kd_trash(a,'test',t,true);
 update public.kd_sessions set status='active',code='000000' where id=sess;
 denied=false;begin perform public.kd_trash(a,'test',t,false);exception when others then denied=true;end;if not denied then raise exception 'Active test deleted';end if;
 -- One invalid row must roll back the entire batch, including new classes.
 k=gen_random_uuid();rowdata=rowdata||jsonb_build_object('importKey',k,'login','qa_'||replace(k::text,'-',''),'className','QA-'||left(k::text,8));
 denied=false;begin perform public.kd_import_users(a,jsonb_build_array(rowdata,rowdata||jsonb_build_object('importKey',gen_random_uuid())));exception when others then denied=true;end;
 if not denied or exists(select 1 from public.kd_users where import_key=k) or exists(select 1 from public.kd_catalog where name=rowdata->>'className') then raise exception 'Batch did not roll back atomically';end if;
end $$;
rollback;
select 'PASS: retries, permissions, reference guards, archive/restore, preserved scores, batch rollback' as result;
