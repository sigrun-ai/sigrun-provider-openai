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

const live = { "x-sigrun-apply": "live" } as const;

const onOff = (title: string, description: string) => ({
	type: "boolean",
	default: true,
	title,
	description,
	...live,
}) as const;

export const OPENAI_SETTINGS_JSON_SCHEMA = {
	type: "object",
	properties: {
		baseUrl: {
			type: "string",
			format: "uri",
			minLength: 1,
			default: "https://api.openai.com/v1",
			title: "Base URL",
			description:
				"The API base URL (any OpenAI-compatible server; the Responses API's ChatGPT branch keys on the exact default string, so leave it unchanged unless pointing elsewhere).",
			...live,
		},
		chat: {
			type: "object",
			properties: {
				enabled: onOff("Chat enabled", "Contribute the OpenAI chat provider (model catalog from pi-ai)."),
			},
			default: {},
			...live,
		},
		decisions: {
			type: "object",
			properties: {
				enabled: onOff("Decisions enabled", "Contribute the OpenAI decision provider (/v1/decisions)."),
				models: {
					type: "array",
					items: { type: "string", minLength: 1 },
					uniqueItems: true,
					minItems: 1,
					default: ["gpt-6-luna"],
					title: "Decision models",
					description: "Model ids offered for decisions (unrecognized ids are dropped with a warning).",
					...live,
				},
			},
			default: {},
			...live,
		},
		embeddings: {
			type: "object",
			properties: {
				enabled: onOff("Embeddings enabled", "Contribute the OpenAI embedding provider (/v1/embeddings)."),
				models: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "string", minLength: 1, title: "Model id" },
							dimensions: {
								type: "integer",
								minimum: 1,
								title: "Dimensions",
								description: "The vector length the model returns.",
							},
						},
						required: ["id", "dimensions"],
						"x-sigrun-key": "id",
						"x-sigrun-summary": ["id", "dimensions"],
					},
					default: [
						{ id: "text-embedding-3-small", dimensions: 1536 },
						{ id: "text-embedding-3-large", dimensions: 3072 },
					],
					title: "Embedding models",
					description: "The embedding models to offer (provider/model ids on the embedding surface).",
					...live,
				},
				maxBatch: {
					type: "integer",
					minimum: 1,
					default: 2048,
					title: "Max batch",
					description: "Inputs per provider request; core splits larger calls.",
					...live,
				},
			},
			default: {},
			...live,
		},
	},
} as const;
