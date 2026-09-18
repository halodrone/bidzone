-- Minimal Supabase auth stubs so BIDZONE migrations can be validated
-- against a real Postgres. Do NOT ship this to Supabase — auth.* already
-- exists there.

create schema if not exists auth;

create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
);

-- auth.uid() is provided by Supabase and returns the JWT subject.
-- For local validation we simulate it with a session-local setting.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
