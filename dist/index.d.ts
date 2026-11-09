/** @sigrun/provider-openai — provider-only OpenAI chat, decision and embedding contributions. */
import type { DecisionProviderContribution, EmbeddingProviderContribution, ProviderContribution } from "@sigrun/sigrun/extension";
import type { OpenAIProviderHost } from "./host.js";
export { createOpenAIChat } from "./chat.js";
export { createOpenAIDecisions } from "./decisions.js";
export { createOpenAIEmbeddings, EMBEDDING_REQUEST_TOKEN_BUDGET, isLocalHost, } from "./embeddings.js";
export { createOpenAIReadiness } from "./readiness.js";
export type { OpenAIReadiness } from "./readiness.js";
export type { OpenAIProviderHost } from "./host.js";
export { DEFAULT_DECISION_MODELS, DEFAULT_EMBEDDING_MAX_BATCH, DEFAULT_EMBEDDING_MODELS, DEFAULT_OPENAI_BASE_URL, parseSettings, } from "./settings.js";
export type { OpenAIEmbeddingModelSettings, OpenAIProviderSettings } from "./settings.js";
export interface OpenAIProviderResult {
    readonly name: "provider-openai";
    readonly providers: readonly ProviderContribution[];
    readonly decisionProviders?: readonly DecisionProviderContribution[];
    readonly embeddingProviders?: readonly EmbeddingProviderContribution[];
}
/** Arity 1: sigrun supplies the scoped host; settings are read once at load. */
export default function createOpenAIProvider(host: OpenAIProviderHost): Promise<OpenAIProviderResult>;
