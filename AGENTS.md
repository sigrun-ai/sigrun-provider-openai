# AGENTS.md — sigrun-provider-openai

Guidance for coding agents working in this repository.

## What this is

`@sigrun/provider-openai` is a provider-only sigrun extension. Its factory
returns `{ name: "provider-openai", providers, decisionProviders,
embeddingProviders }` and no pi-durable extension object. Version 0.1.0
contributes all three kinds under the provider id `openai` — pi-ai's chat
catalog, a decision provider, and an embedding provider — each switchable in
`settings/provider-openai.json`.

## Layout

- `src/index.ts` — async, host-taking factory and public exports; contributes
  only the kinds whose settings section is enabled.
- `src/host.ts` — structural host slice (the async scoped settings store).
- `src/settings.ts` — parser for `settings/provider-openai.json`; unknown or
  malformed values warn and fall back per key.
- `src/chat.ts` — pi-ai [OI] provider wrapper: chat-only catalog and per-request
  base URL applied through resolved auth.
- `src/decisions.ts` — the decision provider: builds the [OI] Decisions request
  body and posts it through pi-ai's transport, parsing answers locally.
- `src/embeddings.ts` — the embedding provider: `POST <baseUrl>/embeddings`,
  split by input count and by an estimated token budget, index-ordered vectors,
  scrubbed failures, plus `isLocalHost` (the per-model `local` report).
- `src/readiness.ts` — the three-state readiness tracker all three kinds share
  (`not_configured` / `degraded` / `ready`).
- `test/` — hermetic vitest suites with synthetic keys and hosts (fake HTTP
  servers for the decisions and embeddings endpoints).
- `dist/` — committed build output.

## Run and test

```sh
npm install
npm test          # node scripts/check-manifest.mjs + vitest run
npm run typecheck
npm run build     # emits dist/ (committed)
```

`dist/` is committed build output; run the build before committing and verify
`git status -- dist` is clean afterward.

## Conventions

- Runtime `dependencies` is empty. Host modules are `"*"` peers with exact
  development pins; `@sigrun/sigrun` is a `file:../sigrun` dev dependency used
  for type-only imports of the extension contract.
- The default base URL `https://api.openai.com/v1` must remain byte-for-byte
  unchanged: pi-ai uses that exact string to select its ChatGPT subscription
  request behavior.
- Do not mutate pi-ai's provider or model catalog in place.
- The factory performs no network requests; it reads scoped settings once.
- Readiness is one tracker per kind. It cannot read `auth.json`, so it learns
  that a credential exists only from a call; on the default public `baseUrl` a
  keyed install reports `not_configured` until its first call (display only).
- Error text never carries the credential or the submitted input: see
  `failureMessage` in `src/embeddings.ts` before changing an error path.
- Tests own their literals: no real hosts, credentials, or deployment details.
- Commits are signed; manifest check, tests, typecheck, and build are the done
  gate.
