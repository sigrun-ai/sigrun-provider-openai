/**
 * Scoped settings for settings/provider-openai.json. Invalid or unknown keys
 * warn and fall back per key; malformed settings never quarantine the plugin.
 *
 * Settings split (plan 3 Task 1): the model sets are no longer settings.
 * Decisions publish pi-ai's classifier catalog and embeddings publish
 * KNOWN_EMBEDDING_MODELS, both fixed at load; a stored `models` list in
 * either section is an unknown key here (core's Advanced pane lists it).
 */
export declare const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export declare const DEFAULT_EMBEDDING_MAX_BATCH = 2048;
export interface OpenAIProviderSettings {
    readonly baseUrl: string;
    readonly chat: {
        readonly enabled: boolean;
    };
    readonly decisions: {
        readonly enabled: boolean;
    };
    readonly embeddings: {
        readonly enabled: boolean;
        readonly maxBatch: number;
    };
}
type Warn = (message: string) => void;
/** Parse one scoped settings snapshot without reading storage or the environment. */
export declare function parseSettings(raw: Record<string, unknown>, warn: Warn): OpenAIProviderSettings;
export {};
