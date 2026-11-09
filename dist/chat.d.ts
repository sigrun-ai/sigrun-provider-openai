import type { ProviderContribution } from "@sigrun/sigrun/extension";
/**
 * pi-ai's [OI] provider with a chat-only catalog and a per-request base URL.
 *
 * The contribution carries the plugin's shared readiness tracker, fed by
 * the auth resolution pi-ai performs before every request: a resolved
 * apiKey is the plugin's only evidence that a credential exists (it cannot
 * read `auth.json`). Chat requests themselves fail inside pi-ai's stream,
 * which this plugin never observes, so chat readiness reports
 * `not_configured` until the first authenticated request and stays `ready`
 * afterwards — the same display-only limitation every kind shares.
 */
export declare function createOpenAIChat(baseUrl: string): ProviderContribution;
