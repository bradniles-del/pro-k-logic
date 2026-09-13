-- 0009: base64url encoding is PostgreSQL 18+; this project runs 17.
-- Provide a helper and repoint the three token defaults at it.

create or replace function public.random_token(n_bytes integer default 16)
returns text language sql volatile as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(n_bytes), 'base64'), '='), '+/', '-_')
$$;

alter table public.invitations alter column token set default public.random_token(24);
alter table public.qr_tokens   alter column token set default public.random_token(16);
alter table public.trips       alter column device_token set default public.random_token(12);
