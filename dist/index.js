import { createOpenAIChat } from "./chat.js";
import { createOpenAIDecisions } from "./decisions.js";
import { parseSettings } from "./settings.js";
export { createOpenAIChat } from "./chat.js";
export { createOpenAIDecisions } from "./decisions.js";
export { DEFAULT_DECISION_MODELS, DEFAULT_EMBEDDING_MAX_BATCH, DEFAULT_EMBEDDING_MODELS, DEFAULT_OPENAI_BASE_URL, parseSettings, } from "./settings.js";
/** Arity 1: sigrun supplies the scoped host; settings are read once at load. */
export default async function createOpenAIProvider(host) {
    const settings = parseSettings(await host.stores.settings.get(), (message) => console.warn(message));
    return {
        name: "provider-openai",
        providers: settings.chat.enabled ? [createOpenAIChat(settings.baseUrl)] : [],
        ...(settings.decisions.enabled
            ? { decisionProviders: [createOpenAIDecisions(settings.baseUrl, settings.decisions.models)] }
            : {}),
    };
}
