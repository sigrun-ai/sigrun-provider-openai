import { createOpenAIChat } from "./chat.js";
import { createOpenAIDecisions } from "./decisions.js";
import { createOpenAIEmbeddings } from "./embeddings.js";
import { parseSettings } from "./settings.js";
import { OPENAI_SETTINGS_JSON_SCHEMA } from "./settings-schema.js";
export { createOpenAIChat } from "./chat.js";
export { createOpenAIDecisions } from "./decisions.js";
export { createOpenAIEmbeddings, EMBEDDING_REQUEST_TOKEN_BUDGET, isLocalHost, } from "./embeddings.js";
export { createOpenAIReadiness } from "./readiness.js";
export { DEFAULT_DECISION_MODELS, DEFAULT_EMBEDDING_MAX_BATCH, DEFAULT_EMBEDDING_MODELS, DEFAULT_OPENAI_BASE_URL, parseSettings, } from "./settings.js";
/** Arity 1: sigrun supplies the scoped host; settings are declared once,
 * then read through the checked handle (defaults applied, forms generated). */
export default async function createOpenAIProvider(host) {
    const declared = host.settings.declare({ schema: OPENAI_SETTINGS_JSON_SCHEMA });
    const warn = (message) => console.warn(message);
    const settings = parseSettings(await declared.get(), warn);
    return {
        name: "provider-openai",
        providers: settings.chat.enabled ? [createOpenAIChat(settings.baseUrl)] : [],
        ...(settings.decisions.enabled
            ? { decisionProviders: [createOpenAIDecisions(settings.baseUrl, settings.decisions.models, warn)] }
            : {}),
        ...(settings.embeddings.enabled
            ? {
                embeddingProviders: [createOpenAIEmbeddings(settings.baseUrl, settings.embeddings.models, settings.embeddings.maxBatch)],
            }
            : {}),
    };
}
