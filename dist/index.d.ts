/** @sigrun/provider-openai — a provider-only [OI] chat contribution. */
import type { ProviderContribution } from "@sigrun/sigrun/extension";
import type { OpenAIProviderHost } from "./host.js";
export { createOpenAIChat } from "./chat.js";
export type { OpenAIProviderHost } from "./host.js";
export { DEFAULT_DECISION_MODELS, DEFAULT_EMBEDDING_MAX_BATCH, DEFAULT_EMBEDDING_MODELS, DEFAULT_OPENAI_BASE_URL, parseSettings, } from "./settings.js";
export type { OpenAIEmbeddingModelSettings, OpenAIProviderSettings } from "./settings.js";
export interface OpenAIProviderResult {
    readonly name: "provider-openai";
    readonly providers: readonly ProviderContribution[];
}
/** Arity 1: sigrun supplies the scoped host; settings are read once at load. */
export default function createOpenAIProvider(host: OpenAIProviderHost): Promise<OpenAIProviderResult>;
