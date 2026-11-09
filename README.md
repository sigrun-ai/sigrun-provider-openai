# @sigrun/provider-openai

Sigrun extension package for [OI]-compatible providers. Version 0.1.0 contributes
pi-ai's [OI] chat catalog through the Responses API, with classifier models kept
out of the chat catalog. Decision and embedding provider kinds will be added in
subsequent versions; their settings are parsed now so the configuration shape is
stable.

## Install

Add `@sigrun/provider-openai` to the sigrun packages and extensions lists in
`settings.json`, then restart sigrun.

## Credential

The provider id is `openai`. Core resolves `auth.json["openai"].apiKey` first,
then the ambient `OPENAI_API_KEY`. Chat authentication uses pi-ai's normal
credential resolution and applies the configured base URL to each request.

## Settings

Scoped settings live in `settings/provider-openai.json`. Every setting is read
when the extension loads; restart sigrun after editing it.

| Setting | Default | Purpose |
| --- | --- | --- |
| `baseUrl` | `https://api.openai.com/v1` | [OI]-compatible API root |
| `chat.enabled` | `true` | Contribute [OI] chat models |
| `decisions.enabled` | `true` | Enable decisions (coming in a subsequent version) |
| `decisions.models` | `["gpt-6-luna"]` | Decision model ids |
| `embeddings.enabled` | `true` | Enable embeddings (coming in a subsequent version) |
| `embeddings.models` | `[{id: "text-embedding-3-small", dimensions: 1536}, {id: "text-embedding-3-large", dimensions: 3072}]` | Embedding model ids and vector dimensions |
| `embeddings.maxBatch` | `2048` | Maximum inputs per embedding request |

Unknown or malformed settings warn and fall back per key. The default `baseUrl`
is passed through unchanged; do not add or remove a trailing slash when using
pi-ai's [OI] subscription-auth behavior.

## Provider kinds

- **Chat:** live in 0.1.0, using pi-ai's [OI] Responses provider.
- **Decisions:** settings are defined; contribution is coming.
- **Embeddings:** settings are defined; contribution is coming.

## Development

```sh
npm install
npm test          # manifest check + vitest
npm run typecheck
npm run build     # emits dist/ (committed)
```

Tests are hermetic and use synthetic credentials and hosts. No real API key or
network access is required.
