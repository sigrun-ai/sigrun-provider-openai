# @sigrun/provider-openai

Sigrun extension package for OpenAI-compatible providers. Version 0.1.0
contributes three provider kinds under the provider id `openai`: pi-ai's OpenAI
chat catalog through the Responses API (classifier models kept out of the chat
catalog), decision providers over `POST /v1/decisions`, and embedding providers
over `POST /v1/embeddings`.

## Install

Add `@sigrun/provider-openai` to the sigrun packages and extensions lists in
`settings.json`, then restart sigrun.

## Credential

The provider id is `openai`. Core resolves `auth.json["openai"].apiKey` first,
then the ambient `OPENAI_API_KEY`; the key is per id, so one credential serves
every kind. Chat authentication uses pi-ai's normal credential resolution and
applies the configured base URL to each request. Decisions and embeddings
receive the resolved key per call; both work without one against a custom
`baseUrl` that does not need it (a local endpoint, for example).

Readiness is reported per kind: `not_configured` when no call has presented a
credential yet AND `baseUrl` points at `api.openai.com`, otherwise `ready`
until a call fails (then `degraded`, with the error, until a success). The
tracker cannot read `auth.json`, so a keyed install pointed at the public API
reports `not_configured` until its first call — display only, and the first
successful call clears it.

## Settings

Scoped settings live in `settings/provider-openai.json`. Every setting is read
when the extension loads; restart sigrun after editing it.

| Setting | Default | Purpose |
| --- | --- | --- |
| `baseUrl` | `https://api.openai.com/v1` | OpenAI-compatible API root |
| `chat.enabled` | `true` | Contribute OpenAI chat models |
| `decisions.enabled` | `true` | Contribute the decision provider |
| `embeddings.enabled` | `true` | Contribute the embedding provider |
| `embeddings.maxBatch` | `2048` | Maximum inputs per embedding request |

The model sets are not settings: decisions publish every pi-ai classifier
catalog entry with api `openai-decisions`, and embeddings publish the known
models (`text-embedding-3-small` 1536, `text-embedding-3-large` 3072,
`text-embedding-ada-002` 1536). Both sets are fixed at load; an id the
account cannot use fails at call time. A stored `decisions.models` or
`embeddings.models` list from an older install is an unknown key (listed on
the Advanced pane) and no longer changes what is offered.

Unknown or malformed settings warn and fall back per key. The default `baseUrl`
is passed through unchanged; do not add or remove a trailing slash when using
pi-ai's OpenAI subscription-auth behavior.

## Provider kinds

- **Chat:** pi-ai's OpenAI Responses provider, model catalog included.
- **Decisions:** the classifier catalog, posted to
  `POST <baseUrl>/decisions`.
- **Embeddings:** one provider with every known model. Each request is
  split so it holds at most `embeddings.maxBatch` inputs and stays within the
  endpoint's per-request token ceiling (estimated at four characters per
  token); vectors return in input order. Each model reports `local` when
  `baseUrl`'s host is loopback or a private address (`127.0.0.0/8`, `::1`,
  `localhost`, `10/8`, `172.16/12`, `192.168/16`, `fc00::/7`), so a local
  embedding server can serve `confidentiality: "local-only"` calls once the
  admin lists the model in core's `embeddings.localModels`.

Readiness is one tracker per kind, fed by the calls themselves: `ready` on a
custom `baseUrl`, and `not_configured` on the default public endpoint until a
call presents a credential (the tracker cannot read `auth.json`, so this is a
display-only gap the first successful call closes); a failed call reports
`degraded` with the error until a success clears it.

## Development

```sh
npm install
npm test          # manifest check + vitest
npm run typecheck
npm run build     # emits dist/ (committed)
```

Tests are hermetic and use synthetic credentials and hosts. No real API key or
network access is required.
