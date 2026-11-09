import { isModelType } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
/** pi-ai's [OI] provider with a chat-only catalog and a per-request base URL. */
export function createOpenAIChat(baseUrl) {
    const base = openaiProvider();
    const models = (base.getAllModels?.() ?? base.getModels()).filter((model) => !isModelType(model, "classifier"));
    const provider = {
        ...base,
        auth: {
            ...base.auth,
            ...(base.auth.apiKey === undefined ? {} : {
                apiKey: {
                    ...base.auth.apiKey,
                    resolve: async (input) => {
                        const resolved = await base.auth.apiKey.resolve(input);
                        return resolved === undefined
                            ? undefined
                            : { ...resolved, auth: { ...resolved.auth, baseUrl } };
                    },
                },
            }),
        },
        getModels: () => models.filter((model) => isModelType(model, "chat")),
        getAllModels: () => models,
    };
    return { provider };
}
