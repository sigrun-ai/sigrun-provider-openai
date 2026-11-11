/** @sigrun/provider-openai — provider-only OpenAI chat, decision and embedding contributions. */
import type {
	DecisionProviderContribution,
	EmbeddingProviderContribution,
	ProviderContribution,
} from "@sigrun/sigrun/extension";
import { createOpenAIChat } from "./chat.js";
import { createOpenAIDecisions } from "./decisions.js";
import { createOpenAIEmbeddings } from "./embeddings.js";
import type { OpenAIProviderHost } from "./host.js";
import { parseSettings } from "./settings.js";
import { OPENAI_SETTINGS_JSON_SCHEMA } from "./settings-schema.js";

export { createOpenAIChat } from "./chat.js";
export { createOpenAIDecisions } from "./decisions.js";
export {
	createOpenAIEmbeddings,
	EMBEDDING_REQUEST_TOKEN_BUDGET,
	isLocalHost,
} from "./embeddings.js";
export { createOpenAIReadiness } from "./readiness.js";
export type { OpenAIReadiness } from "./readiness.js";
export type { OpenAIProviderHost } from "./host.js";
export {
	DEFAULT_EMBEDDING_MAX_BATCH,
	DEFAULT_OPENAI_BASE_URL,
	parseSettings,
} from "./settings.js";
export { KNOWN_EMBEDDING_MODELS } from "./known-models.js";
export type { KnownEmbeddingModel } from "./known-models.js";
export type { OpenAIProviderSettings } from "./settings.js";

export interface OpenAIProviderResult {
	readonly name: "provider-openai";
	readonly title: "OpenAI";
	readonly providers: readonly ProviderContribution[];
	readonly decisionProviders?: readonly DecisionProviderContribution[];
	readonly embeddingProviders?: readonly EmbeddingProviderContribution[];
}

/** Arity 1: sigrun supplies the scoped host; settings are declared once,
 * then read through the checked handle (defaults applied, forms generated). */
export default async function createOpenAIProvider(
	host: OpenAIProviderHost,
): Promise<OpenAIProviderResult> {
	const declared = host.settings.declare({ schema: OPENAI_SETTINGS_JSON_SCHEMA });
	const warn = (message: string) => console.warn(message);
	const settings = parseSettings(await declared.get(), warn);
	return {
		name: "provider-openai",
		title: "OpenAI",
		providers: settings.chat.enabled ? [createOpenAIChat(settings.baseUrl)] : [],
		...(settings.decisions.enabled
			? { decisionProviders: [createOpenAIDecisions(settings.baseUrl)] }
			: {}),
		...(settings.embeddings.enabled
			? {
				embeddingProviders: [createOpenAIEmbeddings(
					settings.baseUrl,
					settings.embeddings.maxBatch,
				)],
			}
			: {}),
	};
}
