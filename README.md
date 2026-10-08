# Snippo

Piattaforma di widget embeddabili: lo sviluppatore incolla una riga di codice, l'azienda riceve richieste strutturate (prenotazioni, contatti, domande) e viene avvisata via email.

Il primo widget è una chat guidata con template per settore (ristorante, appuntamenti, richiesta informazioni). Tutto gira su Cloudflare: API su Workers, database D1, code con Queues.

## Documentazione

- [Documentazione di progetto](docs/documentazione-progetto.md): parte funzionale, architettura, modello dati, hosting e decisioni.

## Struttura

| Percorso | Cosa contiene |
| --- | --- |
| `apps/api` | Worker Hono: API pubblica del widget (`/v1/widget`), autenticazione (`/api/auth`) e API della dashboard (`/api/v1`) |
| `apps/dashboard` | Area privata (React + Vite): registrazione, progetti, inbox richieste, widget, installazione |
| `apps/web` | Landing (Astro) con il widget demo |
| `apps/widgets/chat` | Widget chat (Preact, Shadow DOM), build in `dist/snippo.js` |
| `packages/db` | Schema Drizzle, migrazioni D1, seed di sviluppo |
| `packages/shared` | Schemi dei flussi, regole di validazione, template di settore |

## Sviluppo

Serve solo Node 24. pnpm si usa tramite `corepack` (incluso in Node), senza installazioni globali; Docker e database locali non servono.

```sh
corepack pnpm install
printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" > apps/api/.dev.vars   # una volta sola
corepack pnpm db:setup   # crea il D1 locale (Miniflare, dentro .wrangler/) e carica il ristorante demo
corepack pnpm dev
```

| URL | Cosa |
| --- | --- |
| http://localhost:4321 | Landing, con il widget demo |
| http://localhost:5174 | Dashboard: registrati e crea un progetto |
| http://localhost:5173 | Pagina di prova del widget (chiave demo `pk_dev_snippo`) |
| http://localhost:8787 | API |

La dashboard chiama l'API sul proprio dominio (`/api`, proxy di Vite), come in produzione su `app.snippo.io`: niente CORS e cookie di sessione di prima parte.

Altri comandi:

```sh
corepack pnpm test         # test dell'API nel runtime Workers, con D1 simulato
corepack pnpm typecheck
corepack pnpm build        # build del widget in apps/widgets/chat/dist/snippo.js
corepack pnpm db:generate  # nuova migrazione dopo una modifica a packages/db/src/schema.ts
```

### D1 remoto di sviluppo

Per lavorare sul database di dev in Cloudflare invece che su quello locale:

```sh
cd apps/api
npx wrangler login
npx wrangler d1 create snippo-dev --jurisdiction=eu   # copia il database_id in wrangler.jsonc
corepack pnpm db:migrate:remote
corepack pnpm db:seed:remote
cd ../..
corepack pnpm dev:remote   # API in anteprima su Cloudflare con il D1 remoto, widget su :5173
```

Attenzione: `pnpm dev` scrive sul D1 **locale** (`apps/api/.wrangler/state/`), che non compare nella dashboard di Cloudflare; `pnpm dev:remote` scrive su `snippo-dev`.

## Staging

Ambiente online su `workers.dev`, con database `snippo-staging` (UE) e dati demo:

| Cosa | URL |
| --- | --- |
| Landing | https://snippo-web-staging.oiuliano90.workers.dev |
| Dashboard | https://snippo-dashboard-staging.oiuliano90.workers.dev |
| Widget | https://snippo-cdn-staging.oiuliano90.workers.dev/v1/snippo.js |
| API | https://snippo-api-staging.oiuliano90.workers.dev |

Le notifiche in staging non vengono spedite: finiscono nei log del Worker (`npx wrangler tail --env staging` in `apps/api`).

Deploy manuale (serve `npx wrangler login`): `corepack pnpm deploy:staging`.

Deploy automatico: ogni push su `main` con la CI verde va in staging, se nel repository GitHub ci sono i secret `CLOUDFLARE_API_TOKEN` (token con permessi Workers Scripts, D1 e Queues in modifica) e `CLOUDFLARE_ACCOUNT_ID`.

### Anti-spam

Il widget chiede un token Cloudflare Turnstile, generato da `/v1/challenge.html` sulla CDN (Turnstile accetta pochi domini, i siti dei clienti sono tanti). In sviluppo e in staging si usano le chiavi di test di Cloudflare, che passano sempre. Per la produzione: crea un widget Turnstile con dominio `cdn.snippo.io`, metti la site key in `TURNSTILE_SITE_KEY` (wrangler.jsonc) e la secret con `npx wrangler secret put TURNSTILE_SECRET`.
