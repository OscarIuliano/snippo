# Snippo: istruzioni per Claude

Rispondi all'utente in italiano. Il codice, i commenti e i commit sono in inglese; i testi dell'interfaccia sono in italiano, dentro `t()` o `msg()`.

## Orchestratore e sub-agenti

La sessione principale è l'orchestratore: parla con l'utente, decide il piano, scrive il codice delle funzioni e delega ai sub-agenti in `.claude/agents/` il lavoro che si verifica da solo. I sub-agenti non possono avviare altri agenti, quindi la catena la gestisce sempre l'orchestratore.

| Agente | Quando |
| --- | --- |
| `snippo-tester` | Dopo ogni modifica: typecheck, test, controllo i18n; scrive i test mancanti per le nuove route. |
| `snippo-i18n` | Quando ci sono nuovi testi in `t()`/`msg()`: aggiunge l'inglese e fa passare `check:i18n`. |
| `snippo-reviewer` | Prima di un commit importante: rilegge il diff (isolamento tra clienti, permessi, GDPR, mobile). Non modifica file. |
| `snippo-ui-check` | Dopo una modifica all'interfaccia: screenshot mobile e desktop, segnala overflow e problemi visivi. |
| `snippo-docs` | A fine funzione: aggiorna il backlog nel Claude Doc e in `docs/documentazione-progetto.md`. |
| `snippo-deploy` | Solo quando l'utente ha chiesto il deploy: staging, migrazioni, smoke test. |

Flusso tipico di una funzione: l'orchestratore scrive il codice, poi lancia in parallelo `snippo-tester`, `snippo-i18n` e `snippo-ui-check`, sistema quello che segnalano, chiede a `snippo-reviewer` una rilettura, fa il commit, poi `snippo-docs`. `snippo-deploy` solo su richiesta.

Nel prompt a un sub-agente scrivi sempre cosa è cambiato (file, route, schermate) e cosa deve restituire: il sub-agente non vede questa conversazione.

## Regole fisse

- Commit solo sul branch di lavoro corrente (ora `feat/account`), mai su `main`; push e PR solo se l'utente lo chiede.
- Niente installazioni globali, niente Docker: pnpm sempre tramite `corepack pnpm`.
- Mai chiedere o scrivere in chat token o secret (WhatsApp, Paddle, Turnstile): l'utente li imposta con `wrangler secret put`.
- Non proporre l'estensione Claude in Chrome: per gli screenshot c'è `scripts/ui-flow.mjs`.

## Comandi

```sh
corepack pnpm typecheck
corepack pnpm test            # test API (vitest nel runtime Workers) + check-i18n
corepack pnpm check:i18n
corepack pnpm db:generate     # nuova migrazione dopo una modifica a packages/db/src/schema.ts
corepack pnpm deploy:staging  # API (con migrazioni D1), widget, dashboard, landing
```

Server di sviluppo (`corepack pnpm dev`): landing 4321, dashboard 5174, pagina di prova del widget 5173, API 8787.
Account demo locale: `demo-screenshot@example.com` / `password-demo-123`, progetto "Osteria del Porto" `01a11c4a-8e0f-729c-aa8a-79a34e4c2fb5`.

## Documentazione

Due copie da tenere allineate:
- Claude Doc condiviso: https://claude.ai/code/artifact/86eafee8-08b4-48e8-84e7-820624fc53b6 (tabella backlog `maf5q1txm61.40780`, menu stato `7a0c2014-a075`: 0 Fatto, 1 In corso, 2 Da fare, 3 In attesa di te);
- `docs/documentazione-progetto.md`.
