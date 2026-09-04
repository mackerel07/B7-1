create table if not exists public.chat_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    conversation_id uuid not null,
    question text not null,
    answer text,
    status text not null default 'success',
    error_code text,
    request_id text not null,
    ai_model text not null,
    latency_ms integer not null,
    created_at timestamptz not null default now(),
    constraint chat_logs_question_length
        check (char_length(btrim(question)) between 1 and 2000),
    constraint chat_logs_status
        check (status in ('success', 'failed')),
    constraint chat_logs_success_answer
        check (
            status <> 'success'
            or (answer is not null and char_length(btrim(answer)) > 0)
        ),
    constraint chat_logs_failed_error
        check (status <> 'failed' or error_code is not null),
    constraint chat_logs_latency_nonnegative
        check (latency_ms >= 0),
    constraint chat_logs_user_request_unique
        unique (user_id, request_id)
);

create index if not exists chat_logs_user_created_at_idx
    on public.chat_logs (user_id, created_at desc);

create index if not exists chat_logs_conversation_created_at_idx
    on public.chat_logs (user_id, conversation_id, created_at desc);

alter table public.chat_logs enable row level security;

revoke all on table public.chat_logs from anon;
revoke all on table public.chat_logs from authenticated;
grant select, insert on table public.chat_logs to authenticated;

drop policy if exists "users can read own chat logs" on public.chat_logs;
create policy "users can read own chat logs"
    on public.chat_logs
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own chat logs" on public.chat_logs;
create policy "users can insert own chat logs"
    on public.chat_logs
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

comment on table public.chat_logs is
    'Authenticated AI chat history. Access is restricted to the owning user by RLS.';
comment on column public.chat_logs.request_id is
    'Correlation ID shared by API response, runtime logs, and this database row.';
