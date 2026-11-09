/**
 * Scoped settings for settings/provider-openai.json. Invalid or unknown keys
 * warn and fall back per key; malformed settings never quarantine the plugin.
 */
export declare const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export declare const DEFAULT_DECISION_MODELS: readonly ["gpt-6-luna"];
export declare const DEFAULT_EMBEDDING_MODELS: readonly [{
    readonly id: "text-embedding-3-small";
    readonly dimensions: 1536;
}, {
    readonly id: "text-embedding-3-large";
    readonly dimensions: 3072;
}];
export declare const DEFAULT_EMBEDDING_MAX_BATCH = 2048;
export interface OpenAIEmbeddingModelSettings {
    readonly id: string;
    readonly dimensions: number;
}
export interface OpenAIProviderSettings {
    readonly baseUrl: string;
    readonly chat: {
        readonly enabled: boolean;
    };
    readonly decisions: {
        readonly enabled: boolean;
        readonly models: readonly string[];
    };
    readonly embeddings: {
        readonly enabled: boolean;
        readonly models: readonly OpenAIEmbeddingModelSettings[];
        readonly maxBatch: number;
    };
}
type Warn = (message: string) => void;
/** Parse one scoped settings snapshot without reading storage or the environment. */
export declare function parseSettings(raw: Record<string, unknown>, warn: Warn): OpenAIProviderSettings;
export {};
