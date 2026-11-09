# AGENTS.md — sigrun-provider-openai

Guidance for coding agents working in this repository.

## What this is

`@sigrun/provider-openai` is a provider-only sigrun extension. Its factory
returns `{ name: "provider-openai", providers }` and no pi-durable extension
object. Version 0.1.0 contributes chat only; decisions and embeddings are
separate follow-up work.

## Layout

- `src/index.ts` — async, host-taking factory and public exports.
- `src/host.ts` — structural host slice (the async scoped settings store).
- `src/settings.ts` — parser for `settings/provider-openai.json`; unknown or
  malformed values warn and fall back per key.
- `src/chat.ts` — pi-ai [OI] provider wrapper: chat-only catalog and per-request
  base URL applied through resolved auth.
- `test/` — hermetic vitest suites with synthetic keys and hosts.
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
- Tests own their literals: no real hosts, credentials, or deployment details.
- Commits are signed; manifest check, tests, typecheck, and build are the done
  gate.
