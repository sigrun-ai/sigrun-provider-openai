/** @sigrun/provider-openai — a provider-only [OI] chat contribution. */
import type { DecisionProviderContribution, ProviderContribution } from "@sigrun/sigrun/extension";
import { createOpenAIChat } from "./chat.js";
import { createOpenAIDecisions } from "./decisions.js";
import type { OpenAIProviderHost } from "./host.js";
import { parseSettings } from "./settings.js";

export { createOpenAIChat } from "./chat.js";
export { createOpenAIDecisions } from "./decisions.js";
export type { OpenAIProviderHost } from "./host.js";
export {
	DEFAULT_DECISION_MODELS,
	DEFAULT_EMBEDDING_MAX_BATCH,
	DEFAULT_EMBEDDING_MODELS,
	DEFAULT_OPENAI_BASE_URL,
	parseSettings,
} from "./settings.js";
export type { OpenAIEmbeddingModelSettings, OpenAIProviderSettings } from "./settings.js";

export interface OpenAIProviderResult {
	readonly name: "provider-openai";
	readonly providers: readonly ProviderContribution[];
	readonly decisionProviders?: readonly DecisionProviderContribution[];
}

/** Arity 1: sigrun supplies the scoped host; settings are read once at load. */
export default async function createOpenAIProvider(
	host: OpenAIProviderHost,
): Promise<OpenAIProviderResult> {
	const settings = parseSettings(
		await host.stores.settings.get(),
		(message) => console.warn(message),
	);
	return {
		name: "provider-openai",
		providers: settings.chat.enabled ? [createOpenAIChat(settings.baseUrl)] : [],
		...(settings.decisions.enabled
			? { decisionProviders: [createOpenAIDecisions(settings.baseUrl, settings.decisions.models)] }
			: {}),
	};
}
