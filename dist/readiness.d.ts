/**
 * The one readiness tracker this plugin's provider kinds share (spec §3):
 * `not_configured` when no credential has been seen AND `baseUrl`'s host is
 * the vendor's own public API, otherwise `ready` until a call fails; a
 * failed call leaves it `degraded` with the error text until a success
 * clears it.
 *
 * A tracker CANNOT read `auth.json` — core owns credentials and hands them
 * over per call — so "a credential exists" is learned only from a call that
 * carried one. The visible consequence is display-only: before the first
 * call, a keyed install pointed at the default base URL reports
 * `not_configured`. That limitation is deliberate and shared by every kind;
 * it is also why the rule keys on the endpoint as well, so a keyless custom
 * endpoint (a local embedding server, say) starts `ready` instead of
 * waiting for a call that may never carry a key.
 */
import type { ProviderReadiness } from "@sigrun/sigrun/extension";
export interface OpenAIReadiness {
    /** True when `baseUrl`'s host is the vendor's public API. */
    readonly publicEndpoint: boolean;
    /** The contribution's `readiness` tracker (a pure synchronous read). */
    readiness(): ProviderReadiness;
    /** Record the credential a call carried (absent/empty teaches nothing). */
    noteCredential(credential: string | undefined): void;
    /** Record a successful call: clears a previous failure. */
    noteSuccess(): void;
    /** Record a failed call; `message` becomes the degraded detail. */
    noteFailure(message: string): void;
}
/** One tracker instance per provider kind, over the kind's resolved baseUrl. */
export declare function createOpenAIReadiness(baseUrl: string): OpenAIReadiness;
