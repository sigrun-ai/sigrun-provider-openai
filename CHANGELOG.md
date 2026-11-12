# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-12

### Changed

- Publish the provider's known models instead of hand-maintained lists —
  the catalogue follows what the provider actually serves, and the
  hand-maintained model tables are gone.

## [Unreleased]

### Changed

- No hand-maintained model lists (settings split): decisions publish every
  pi-ai classifier catalog entry with api `openai-decisions`, and embeddings
  publish the known models with their dimensions (`text-embedding-3-small`
  1536, `text-embedding-3-large` 3072, `text-embedding-ada-002` 1536). Both
  sets are fixed at load — no `/v1/models` intersection; an id the account
  cannot use fails at call time, as before. The `decisions.models` and
  `embeddings.models` settings keys are removed: an old settings file still
  loads and its stored lists are unknown keys on core's Advanced pane.
- The factory declares the display title `OpenAI` (core 0.15.0+).
- The `@sigrun/sigrun` peer floor is `>=0.15.0` (the settings-split core).

## [0.1.1] - 2026-11-10

### Changed

- Settings are schema-declared (`host.settings.declare`): core renders the
  generated settings form on the extension's page (0.13.0+). Same keys,
  same defaults; the parser's degrade rules stay as a normalizer over the
  checked read.

## [0.1.0] - 2026-11-08

### Added

- Initial release: OpenAI chat models through pi-ai, scoped settings, and a configurable API base URL.
- The decision provider kind: one provider per configured model over `POST /v1/decisions`.
- The embedding provider kind: every configured model over `POST /v1/embeddings`, split by input count and by an estimated token budget, with a per-model `local` report derived from `baseUrl`'s host.
- One shared readiness tracker across the three kinds.
