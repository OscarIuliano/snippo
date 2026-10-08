# Snippo

Piattaforma di widget embeddabili: lo sviluppatore incolla una riga di codice, l'azienda riceve richieste strutturate (prenotazioni, contatti, domande) e viene avvisata su email e Telegram.

Il primo widget è una chat guidata con template per settore (ristorante, appuntamenti, richiesta informazioni). Tutto gira su Cloudflare: API su Workers, database D1, code con Queues.

## Documentazione

- [Documentazione di progetto](docs/documentazione-progetto.md): parte funzionale, architettura, modello dati, hosting e decisioni.

## Struttura

| Percorso | Cosa contiene |
| --- | --- |
| `apps/api` | Worker Hono: `GET /v1/widget/config`, `POST /v1/widget/submissions` |
| `apps/widgets/chat` | Widget chat (Preact, Shadow DOM), build in `dist/snippo.js` |
| `packages/db` | Schema Drizzle, migrazioni D1, seed di sviluppo |
| `packages/shared` | Schemi dei flussi, regole di validazione, template di settore |

## Sviluppo

Serve solo Node 24. pnpm si usa tramite `corepack` (incluso in Node), senza installazioni globali; Docker e database locali non servono.

```sh
corepack pnpm install
corepack pnpm db:setup   # crea il D1 locale (Miniflare, dentro .wrangler/) e carica il ristorante demo
corepack pnpm dev        # API su http://localhost:8787, widget su http://localhost:5173
```

Apri http://localhost:5173: la pagina di prova carica il widget con la chiave demo `pk_dev_snippo`.

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
