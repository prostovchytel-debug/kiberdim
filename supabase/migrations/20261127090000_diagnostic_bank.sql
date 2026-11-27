-- Custom platform authentication is checked in the quiz Edge Function.
create table public.kd_diagnostic_bank (
 id uuid primary key,
 owner uuid not null references public.kd_users(id),
 subject text not null check (length(subject) between 1 and 100),
 kind text not null check (kind in ('skills','resultGroups','materials')),
 data jsonb not null,
 updated_at timestamptz not null default now()
);
create index kd_diagnostic_bank_owner_subject on public.kd_diagnostic_bank(owner,subject);
alter table public.kd_diagnostic_bank enable row level security;
revoke all on public.kd_diagnostic_bank from public,anon,authenticated;
grant select,insert,update,delete on public.kd_diagnostic_bank to service_role;
alter table public.kd_attempts add column teacher_comment text not null default '' check (length(teacher_comment)<=4000);
alter table public.kd_attempts add column comment_visible boolean not null default false;
