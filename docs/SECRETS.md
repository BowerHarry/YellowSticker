# Secrets and sensitive configuration

Never commit **secret API keys**, **Stripe secret keys**, **webhook signing secrets**, or **database passwords** to git.

- **Hosted Supabase**: Edge functions read **project secrets** (`supabase secrets set …` or Dashboard → Edge Functions → Secrets).  
- **Web app**: Vite env files stay local — see `web/env.sample` and `docs/env.sample`.

## Supabase publishable & secret keys (recommended)

Supabase is moving from long-lived JWT **`anon`** / **`service_role`** keys to:

| Key | Prefix | Use |
|-----|--------|-----|
| **Publishable** | `sb_publishable_…` | Browser, extension, public SPA — same role as legacy `anon` (RLS applies). |
| **Secret** | `sb_secret_…` | Edge Functions, servers, cron — same privilege as legacy `service_role` (bypasses RLS). |

Official overview: [Understanding API keys](https://supabase.com/docs/guides/api/api-keys).

### This repo after migration

| Location | Variable |
|----------|----------|
| **Web** (`web/.env.local`) | `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (fallback: `VITE_PUBLIC_SUPABASE_ANON_KEY` during transition) |
| **Edge functions** (secrets) | **`BACKEND_API_SECRET_KEY`** (`sb_secret_…` or legacy JWT). Hosted projects **cannot** use custom secret names starting with `SUPABASE_`. Fallback: optional **`SERVICE_ROLE_KEY`**, or platform-injected **`SUPABASE_SERVICE_ROLE_KEY`**. |
| **Firefox extension** | Paste the **publishable** key into the options field (stored under the internal key name `supabaseAnonKey`). |
| **Postgres cron** → `net.http_post` | Database setting `app.settings.service_role_key` — value should be your **`sb_secret_…`** (same setting name as before; it is the “privileged gateway key”, not necessarily a JWT). |

Edge functions already use **`verify_jwt = false`** in `supabase/config.toml` for every function so the gateway accepts non-JWT API keys.

### Operator checklist (disable legacy JWT keys)

1. **Dashboard** → **Settings** → **API Keys** → create **Publishable** and at least one **Secret** key if you have not already.  
2. **Edge Functions → Secrets**: set **`BACKEND_API_SECRET_KEY`** to the `sb_secret_…` value (do not use a name starting with `SUPABASE_`). Optionally set **`SERVICE_ROLE_KEY`** for a legacy JWT during migration. Redeploy functions.  
3. **Web**: set `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` / hosting env; remove `VITE_PUBLIC_SUPABASE_ANON_KEY` when done.  
4. **Extension**: paste the new publishable key in options → Save.  
5. **Cron SQL** (if used): update `app.settings.service_role_key` to the **`sb_secret_…`** value (see below). Run migration `20260423150000_*` or later so `net.http_post` sends both `apikey` and `Authorization`.  
6. **Verify** production: web login, extension run-once, monitor admin, stripe webhook path.  
7. **Dashboard** → **API Keys** → **Legacy API keys** → **deactivate** `anon` and `service_role` when “last used” indicators show nothing still depends on them.  
8. Remove legacy env vars from CI and delete old secrets from the vault.

## Rotating a compromised key

### If a legacy `service_role` **JWT** was leaked

1. Create / use a **`sb_secret_…`** key and deploy it as `SUPABASE_SECRET_KEY` everywhere the old JWT lived (edge secrets, cron DB setting, any `.env`).  
2. **Deactivate** the legacy `service_role` key in the dashboard once traffic has moved.  
3. You do **not** need to “regenerate service_role” independently if you fully move off JWT keys — the new secret keys are rotated by **create new → swap → delete old** in the API Keys UI.

### If a new `sb_secret_…` was leaked

Create another secret key in the dashboard, update all backends, then **delete** the compromised secret key entry.

## Configuring `invoke_scrape_tickets` (cron → edge function)

Set these **once per environment** in the Supabase **SQL Editor**. Use your project URL and your current **secret** key (`sb_secret_…` preferred):

```sql
alter database postgres set app.settings.functions_url
  to 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scrape-tickets';

-- Privileged key for the edge gateway (sb_secret_… recommended; legacy service_role JWT still works until disabled)
alter database postgres set app.settings.service_role_key
  to 'YOUR_SB_SECRET_OR_LEGACY_JWT';
```

If `alter database … set` is not permitted on your plan, use Supabase’s documented approach for **custom database settings** or **Vault**.

For **local** `supabase start`, use keys from `supabase status` (JWT-based locally until the platform exposes `sb_*` keys to the CLI).

## Edge function secrets (Deno)

```bash
supabase secrets set BACKEND_API_SECRET_KEY='sb_secret_...'
# Optional legacy JWT during migration (name must not start with SUPABASE_):
# supabase secrets set SERVICE_ROLE_KEY='eyJ...'
```

Do not default to a literal key in code.

## Pre-commit hygiene

- Use `git grep` / IDE search for `eyJ` (JWT prefix) and `sb_secret` before pushing.  
- Prefer `supabase db diff` + reviewed migrations over ad-hoc SQL that embeds keys.  
- Keep `web/.env.local` and any `*.pem` out of git (`.gitignore`).

## Git history

Removing a secret from **current** files does not erase it from **past commits** on GitHub. After rotation, consider [removing sensitive data from history](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) if the repository was public and the key was live. Rotating / deleting the key in the dashboard remains the primary defence.
