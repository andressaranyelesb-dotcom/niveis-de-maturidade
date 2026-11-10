-- Níveis de Maturidade Organizacional (ASI) — esquema do banco (MVP)
-- Modelo: uma tabela por coleção da aplicação; cada linha guarda o registro completo em `data` (jsonb)
-- e as colunas geradas permitem filtrar/consultar sem mexer no JSON. Script idempotente.

-- 1) Tabelas ---------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['times','coaches','lts','squads','acoes','necessidades','niveis','criterios','marcacoes','nivel_hist','avaliacoes','app_config']
  loop
    execute format($f$create table if not exists public.%I (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now(),
      updated_by uuid default auth.uid()
    )$f$, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- colunas geradas (consultas e índices)
alter table public.squads       add column if not exists codigo     text generated always as (data->>'codigo')    stored;
alter table public.squads       add column if not exists time_id    text generated always as (data->>'timeId')    stored;
alter table public.squads       add column if not exists coach_id   text generated always as (data->>'coachId')   stored;
alter table public.squads       add column if not exists cp_classe  text generated always as (data->>'cpClasse')  stored;
alter table public.squads       add column if not exists nivel_id   text generated always as (data->>'nivel')     stored;
alter table public.necessidades add column if not exists squad_id   text generated always as (data->>'squadId')   stored;
alter table public.necessidades add column if not exists status     text generated always as (data->>'status')    stored;
alter table public.necessidades add column if not exists azure_id   text generated always as (data->>'azureId')   stored;
alter table public.avaliacoes   add column if not exists squad_id   text generated always as (data->>'squadId')   stored;
alter table public.nivel_hist   add column if not exists squad_id   text generated always as (data->>'squadId')   stored;
alter table public.marcacoes    add column if not exists squad_id   text generated always as (data->>'squadId')   stored;
alter table public.marcacoes    add column if not exists criterio_id text generated always as (data->>'criterioId') stored;

create index if not exists necessidades_squad_idx  on public.necessidades (squad_id);
create index if not exists necessidades_azure_idx  on public.necessidades (azure_id);
create index if not exists avaliacoes_squad_idx    on public.avaliacoes (squad_id);
create index if not exists nivel_hist_squad_idx    on public.nivel_hist (squad_id);
create index if not exists marcacoes_squad_idx     on public.marcacoes (squad_id);

-- 2) Carimbo de atualização (quem/quando) ---------------------------------------------------------
create or replace function public.touch_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['times','coaches','lts','squads','acoes','necessidades','niveis','criterios','marcacoes','nivel_hist','avaliacoes','app_config']
  loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I for each row execute function public.touch_row()', t);
  end loop;
end $$;

-- 3) Segurança (RLS): só usuários autenticados leem e gravam; o acesso anônimo não vê nada ------------
do $$
declare t text;
begin
  foreach t in array array['times','coaches','lts','squads','acoes','necessidades','niveis','criterios','marcacoes','nivel_hist','avaliacoes','app_config']
  loop
    execute format('drop policy if exists "autenticados_total" on public.%I', t);
    execute format('create policy "autenticados_total" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- 4) Restrição opcional de domínio de e-mail no cadastro ---------------------------------------------
-- Tabela vazia = qualquer e-mail pode se cadastrar. Para limitar ao e-mail corporativo:
--   insert into public.allowed_domains(domain) values ('suaempresa.com.br');
create table if not exists public.allowed_domains (domain text primary key check (domain = lower(domain)));
alter table public.allowed_domains enable row level security;   -- sem policies: nenhum acesso via API

create or replace function public.check_signup_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.allowed_domains)
     and not exists (select 1 from public.allowed_domains d where lower(split_part(new.email, '@', 2)) = d.domain) then
    raise exception 'dominio_nao_permitido';
  end if;
  return new;
end $$;
revoke all on function public.check_signup_domain() from public, anon, authenticated;

drop trigger if exists check_signup_domain on auth.users;
create trigger check_signup_domain before insert on auth.users for each row execute function public.check_signup_domain();
