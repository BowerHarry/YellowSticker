# Yellow Sticker

Same-day **standing theatre ticket** alerts for London West End shows. When a tracked production has standing inventory worth surfacing, subscribers get an email with a link to the **official** box office — you complete purchase there, at normal prices.

## Why it is built this way

The availability checker runs as a **Firefox extension** on a small home machine. Requests use a real browser session (cookies, TLS, challenges), not a datacenter headless browser. Supabase provides **Postgres**, **Auth**, and **Edge Functions**; **Stripe** handles £2/month per-show subscriptions; **Resend** sends mail.

## Architecture (high level)

```
┌─────────────────────┐         ┌──────────────────────────────┐
│  web/               │  HTTPS  │  Supabase                    │
│  React + Vite SPA   │────────▶│  Postgres + Auth           │
│  marketing, subs,   │         │  Edge Functions             │
│  /monitor           │         │  (Stripe, email, scrapes)  │
└─────────────────────┘         └───────────────▲────────────┘
                                                  │
                     ┌────────────────────────────┘
                     │  POST heartbeats + availability
                     │
              ┌──────┴───────┐
              │  Firefox     │
              │  extension   │────▶ theatre box office (user session)
              └──────────────┘
```

- **`web/`** — customer-facing site and operator `/monitor` UI.  
- **`supabase/`** — SQL migrations, seeds, Deno edge functions.  
- **`firefox-extension/`** — on-prem scraper; see [`firefox-extension/README.md`](firefox-extension/README.md).  
- **`docs/`** — deeper notes (architecture, env template, ops).

More detail: [`docs/architecture.md`](docs/architecture.md).

## Repo layout

| Path | Role |
|------|------|
| [`web/`](web/) | React 18 + TypeScript + Vite |
| [`supabase/`](supabase/) | Schema, `migrations/`, edge functions |
| [`firefox-extension/`](firefox-extension/) | WebExtension scraper |
| [`docs/`](docs/) | Design + runbooks |

## Documentation index

| Doc | Contents |
|-----|----------|
| [`docs/architecture.md`](docs/architecture.md) | Data flow, components, extension behaviour |
| [`docs/SECRETS.md`](docs/SECRETS.md) | **Secret rotation**, DB settings for cron, hygiene |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Local Supabase, deploy, web dev, migrations |
| [`docs/STRIPE.md`](docs/STRIPE.md) | Test vs live keys and webhooks |
| [`docs/TESTING.md`](docs/TESTING.md) | Monitor dashboard, test fixture, manual checks |
| [`docs/env.sample`](docs/env.sample) | Environment variable names (no secrets) |

## Getting started (short)

1. **Clone** the repo.  
2. **Supabase** — follow [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) (`supabase start`, migrations, `functions deploy`, `secrets set`).  
3. **Extension** — [`firefox-extension/README.md`](firefox-extension/README.md).  
4. **Web** — `cd web && npm install`, copy `docs/env.sample` to `web/.env.local`, fill values, `npm run dev`.

**Security:** never commit Supabase **secret** keys (`sb_secret_…` or legacy `service_role` JWTs), Stripe secret keys, or webhook secrets. Use **publishable** keys (`sb_publishable_…`) only in the browser/extension — see [`docs/SECRETS.md`](docs/SECRETS.md).
