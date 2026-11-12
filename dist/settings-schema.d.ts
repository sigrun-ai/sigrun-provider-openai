/**
 * The provider-openai settings schema (settings rework follow-up): the
 * parser-era keys declared as JSON Schema for core's generated settings
 * form and checked read. Authored as raw JSON Schema, the gateway
 * precedent (TypeBox wraps table shapes in a way the generator cannot
 * read).
 *
 * Every field is `live`: the factory re-reads settings per boot and the
 * readiness/locality checks resolve `baseUrl` per call — nothing here
 * requires a restart. No credentials live in this schema (the OpenAI key
 * is the Providers-page/auth.json `openai` entry, not a settings field).
 */
export declare const OPENAI_SETTINGS_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly baseUrl: {
            readonly "x-sigrun-apply": "live";
            readonly type: "string";
            readonly format: "uri";
            readonly minLength: 1;
            readonly default: "https://api.openai.com/v1";
            readonly title: "Base URL";
            readonly description: "The API base URL (any OpenAI-compatible server; the Responses API's ChatGPT branch keys on the exact default string, so leave it unchanged unless pointing elsewhere).";
        };
        readonly chat: {
            readonly "x-sigrun-apply": "live";
            readonly type: "object";
            readonly properties: {
                readonly enabled: {
                    readonly "x-sigrun-apply": "live";
                    readonly type: "boolean";
                    readonly default: true;
                    readonly title: string;
                    readonly description: string;
                };
            };
            readonly default: {};
        };
        readonly decisions: {
            readonly "x-sigrun-apply": "live";
            readonly type: "object";
            readonly properties: {
                readonly enabled: {
                    readonly "x-sigrun-apply": "live";
                    readonly type: "boolean";
                    readonly default: true;
                    readonly title: string;
                    readonly description: string;
                };
            };
            readonly default: {};
        };
        readonly embeddings: {
            readonly "x-sigrun-apply": "live";
            readonly type: "object";
            readonly properties: {
                readonly enabled: {
                    readonly "x-sigrun-apply": "live";
                    readonly type: "boolean";
                    readonly default: true;
                    readonly title: string;
                    readonly description: string;
                };
                readonly maxBatch: {
                    readonly "x-sigrun-apply": "live";
                    readonly type: "integer";
                    readonly minimum: 1;
                    readonly default: 2048;
                    readonly title: "Max batch";
                    readonly description: "Inputs per provider request; core splits larger calls.";
                };
            };
            readonly default: {};
        };
    };
};
