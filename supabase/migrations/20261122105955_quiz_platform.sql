create table public.kd_users (
 id uuid primary key default gen_random_uuid(), login text unique not null check(login=lower(login)), name text not null,
 role text not null check(role in ('admin','teacher','student')), subjects text[] not null default '{}', class_name text not null default '',
 password_hash text not null, iterations integer not null default 600000, blocked boolean not null default false,
 must_change boolean not null default true, auth_version integer not null default 0, created_at timestamptz not null default now()
);
create table public.kd_auth (token_hash text primary key, user_id uuid not null references public.kd_users(id), version integer not null, expires_at timestamptz not null);
create index kd_auth_user on public.kd_auth(user_id);
create table public.kd_catalog (id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('class','subject')),name text not null,unique(kind,name));
create table public.kd_tests (id uuid primary key default gen_random_uuid(),owner uuid not null references public.kd_users(id),data jsonb not null,updated_at timestamptz not null default now());
create index kd_tests_owner on public.kd_tests(owner);
create table public.kd_sessions (
 id uuid primary key default gen_random_uuid(),owner uuid not null references public.kd_users(id),test_id uuid not null references public.kd_tests(id),
 code text not null check(code ~ '^[0-9]{6}$'),title text not null,subject text not null,classes text[] not null,data jsonb not null,
 status text not null default 'active' check(status in ('active','paused','closed','cancelled')),
 paused_at bigint,paused_ms bigint not null default 0,revision integer not null default 0,created_at timestamptz not null default now(),ended_at timestamptz
);
create unique index kd_active_pin on public.kd_sessions(code) where status in ('active','paused');
create index kd_sessions_owner on public.kd_sessions(owner);
create index kd_sessions_test on public.kd_sessions(test_id);
create table public.kd_attempts (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.kd_sessions(id),token_hash text unique not null,
 user_id uuid references public.kd_users(id),name text not null,class_name text not null,data jsonb not null,
 done boolean not null default false,revision integer not null default 0,created_at timestamptz not null default now(),finished_at timestamptz
);
create index kd_attempts_session on public.kd_attempts(session_id);
create index kd_attempts_user on public.kd_attempts(user_id);
create table public.kd_rate (key text primary key,hits integer not null,expires_at timestamptz not null);
create table public.kd_audit (id bigint generated always as identity primary key,actor uuid references public.kd_users(id),action text not null,target uuid,created_at timestamptz not null default now());
create index kd_audit_actor on public.kd_audit(actor);
-- Direct browser access is denied. The Edge Function checks identities and ownership.
-- RLS has no client policies intentionally. No credential or answer row is public.
do $$ declare t text;begin foreach t in array array['kd_users','kd_auth','kd_catalog','kd_tests','kd_sessions','kd_attempts','kd_rate','kd_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end $$;
create function public.kd_limit(p_key text,p_max integer,p_seconds integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;begin
 insert into public.kd_rate as r(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when r.expires_at<now() then 1 else r.hits+1 end,expires_at=case when r.expires_at<now() then now()+make_interval(secs=>p_seconds) else r.expires_at end returning hits into n;
 return n<=p_max;end $$;
create function public.kd_join(p_session uuid,p_token text,p_user uuid,p_name text,p_class text,p_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.kd_sessions; a uuid;begin
 select * into s from public.kd_sessions where id=p_session for share;
 if s.id is null or s.status<>'active' then raise exception 'Сеанс недоступний.';end if;
 if not p_class=any(s.classes) then raise exception 'Оберіть клас сеансу.';end if;
 if (select count(*) from public.kd_attempts where session_id=p_session)>500 then raise exception 'Ліміт учасників сеансу.';end if;
 insert into public.kd_attempts(session_id,token_hash,user_id,name,class_name,data) values(p_session,p_token,p_user,p_name,p_class,p_data) returning id into a;return a;end $$;
create function public.kd_commit_attempt(p_id uuid,p_token text,p_revision integer,p_session_revision integer,p_data jsonb,p_done boolean) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.kd_sessions;a public.kd_attempts;begin
 select s0.* into s from public.kd_sessions s0 join public.kd_attempts a0 on a0.session_id=s0.id where a0.id=p_id for share of s0;
 if s.id is null or s.status<>'active' or s.revision<>p_session_revision then return false;end if;
 select * into a from public.kd_attempts where id=p_id for update;
 if a.token_hash<>p_token or a.revision<>p_revision or a.done then return false;end if;
 update public.kd_attempts set data=p_data,done=p_done,revision=revision+1,finished_at=case when p_done then now() else null end where id=p_id;return true;end $$;
create function public.kd_session_action(p_id uuid,p_owner uuid,p_action text) returns void language plpgsql security invoker set search_path='' as $$
declare s public.kd_sessions;ms bigint;begin
 select * into s from public.kd_sessions where id=p_id and owner=p_owner for update;
 if s.id is null then raise exception 'Сеанс не знайдено.';end if;
 ms=floor(extract(epoch from clock_timestamp())*1000);
 if p_action='pause' and s.status='active' then update public.kd_sessions set status='paused',paused_at=ms,revision=revision+1 where id=p_id;
 elsif p_action='resume' and s.status='paused' then update public.kd_sessions set status='active',paused_ms=paused_ms+ms-paused_at,paused_at=null,revision=revision+1 where id=p_id;
 elsif p_action in ('close','cancel') and s.status in ('active','paused') then update public.kd_sessions set status=case when p_action='close' then 'closed' else 'cancelled' end,ended_at=now(),revision=revision+1 where id=p_id;
 else raise exception 'Цей перехід стану вже недоступний.';end if;
end $$;
revoke all on function public.kd_limit(text,integer,integer),public.kd_join(uuid,text,uuid,text,text,jsonb),public.kd_commit_attempt(uuid,text,integer,integer,jsonb,boolean),public.kd_session_action(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kd_limit(text,integer,integer),public.kd_join(uuid,text,uuid,text,text,jsonb),public.kd_commit_attempt(uuid,text,integer,integer,jsonb,boolean),public.kd_session_action(uuid,uuid,text) to service_role;
