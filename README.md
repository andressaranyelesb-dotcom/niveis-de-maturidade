# Níveis de Maturidade Organizacional · ASI

Aplicação web para acompanhar as squads da ASI: níveis de maturidade (avaliação por critérios), necessidades organizacionais e visão geral consolidada.
HTML/CSS/JavaScript puro no navegador, com **Supabase** (Auth + Postgres) como banco e **Vercel** como hospedagem estática.

## Estrutura

```
public/                  site estático publicado pela Vercel
  index.html             página
  app.js                 aplicação (telas, regras de maturidade, sincronização com o Supabase)
  styles.css             identidade visual
  seed.js                vazio de propósito: nenhum dado do negócio fica no repositório
  config.js              GERADO no build (não versionado)
scripts/
  build-config.js        gera public/config.js a partir das variáveis de ambiente
  serve.js               servidor local (npm run dev)
supabase/migrations/     esquema do banco (mesma migração aplicada no projeto Supabase)
vercel.json              build, pasta publicada e cabeçalhos de segurança (CSP)
.env.example             modelo das variáveis
```

## Segurança

- **Nenhuma chave no repositório.** URL e chave do Supabase entram como variáveis de ambiente na Vercel; o `config.js` é gerado no build e está no `.gitignore`.
- A chave usada é a **publicável** (`sb_publishable_...`). Ela é pública por natureza: aparece no navegador de quem usa o app. A proteção dos dados vem do **login** e do **RLS** no banco: sem sessão, nenhuma tabela é lida ou gravada.
- O build **recusa** chaves secretas (`sb_secret_...` ou JWT `service_role`), para que nunca sejam publicadas por engano.
- Planilhas, backups `.json` e arquivos `.env` estão no `.gitignore`.
- Opcional: limitar o cadastro ao e-mail corporativo, de duas formas (podem ser usadas juntas):
  - na Vercel, `ALLOWED_EMAIL_DOMAINS=bnb.gov.br` (validação na tela);
  - no banco (vale mesmo fora da tela): `insert into public.allowed_domains(domain) values ('bnb.gov.br');`

## Banco (Supabase)

A migração em `supabase/migrations/` já está aplicada no projeto. Para recriar em outro projeto, execute o arquivo no **SQL Editor** do Supabase.

- Uma tabela por coleção do app (`squads`, `necessidades`, `avaliacoes`, `criterios`, `niveis`, `nivel_hist`, `times`, `coaches`, `lts`, `acoes`, `marcacoes`, `app_config`), cada registro em `data` (jsonb) com colunas geradas para consulta (`squad_id`, `status`, `azure_id`…).
- `updated_at` / `updated_by` preenchidos automaticamente.
- RLS: somente usuários autenticados (`authenticated`) leem e gravam; `anon` não tem acesso.
- Auth: e-mail e senha, **sem confirmação de e-mail** (Authentication → Sign In / Providers → Email → *Confirm email* desligado).

## Deploy na Vercel

1. **Add New → Project** → importe este repositório do GitHub.
2. *Framework Preset*: **Other**. Build, install e pasta de saída já vêm do `vercel.json`.
3. **Environment Variables** (Production e Preview):
   - `SUPABASE_URL` = `https://<ref-do-projeto>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` = chave publicável (Supabase → Project Settings → API Keys)
   - `ALLOWED_EMAIL_DOMAINS` (opcional)
4. **Deploy.** Cada push na branch principal publica de novo.

## Primeiro uso / carga dos dados

1. No app antigo (link do claude.ai): **Continuar sem conexão** → **Exportar backup** (rodapé do menu) → salva um `.json`. Não envie esse arquivo ao GitHub.
2. No endereço da Vercel: **Criar conta** → com o banco vazio, use **Importar backup** e escolha o `.json`.
3. Pronto: os dados ficam no banco para todos que fizerem login. **Atualizar** traz o que outras pessoas gravaram.

A importação de necessidades do **Azure DevOps** (CSV/Excel da query) fica na aba *Necessidades* → **Importar necessidade**; itens com o mesmo ID são atualizados, nunca duplicados.

## Rodar localmente

```bash
cp .env.example .env    # preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY
npm run dev             # http://localhost:5173
```
