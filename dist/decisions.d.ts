import type { DecisionProviderContribution } from "@sigrun/sigrun/extension";
/**
 * The decision-provider contribution. Readiness is `not_configured` when the
 * last call carried no credential and the endpoint is OpenAI's own host (a
 * keyless custom endpoint stays ready); a failed call marks the tracker
 * `degraded` until a success. `evaluate` throws for transport and answer
 * failures; core maps a throw to `failed`.
 */
export declare function createOpenAIDecisions(baseUrl: string): DecisionProviderContribution;
