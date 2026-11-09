/**
 * Scoped settings for settings/provider-openai.json. Invalid or unknown keys
 * warn and fall back per key; malformed settings never quarantine the plugin.
 */

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_DECISION_MODELS = ["gpt-6-luna"] as const;
export const DEFAULT_EMBEDDING_MODELS = [
	{ id: "text-embedding-3-small", dimensions: 1536 },
	{ id: "text-embedding-3-large", dimensions: 3072 },
] as const;
export const DEFAULT_EMBEDDING_MAX_BATCH = 2048;

export interface OpenAIEmbeddingModelSettings {
	readonly id: string;
	readonly dimensions: number;
}

export interface OpenAIProviderSettings {
	readonly baseUrl: string;
	readonly chat: { readonly enabled: boolean };
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
type Section = Record<string, unknown>;

function section(
	raw: Record<string, unknown>,
	key: "chat" | "decisions" | "embeddings",
	warn: Warn,
): Section {
	const value = raw[key];
	if (value === undefined) return {};
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		warn(`provider-openai: settings.${key} must be an object; using the default`);
		return {};
	}
	return value as Section;
}

function unknownKeys(raw: Section, known: readonly string[], path: string, warn: Warn): void {
	for (const key of Object.keys(raw)) {
		if (!known.includes(key)) {
			warn(`provider-openai: unknown ${path} key "${key}"; ignoring`);
		}
	}
}

function boolean(raw: Section, key: "enabled", path: string, warn: Warn): boolean {
	const value = raw[key];
	if (value === undefined) return true;
	if (typeof value !== "boolean") {
		warn(`provider-openai: settings.${path}.${key} must be a boolean; using the default`);
		return true;
	}
	return value;
}

function decisionModels(raw: Section, warn: Warn): readonly string[] {
	if (raw.models === undefined) return [...DEFAULT_DECISION_MODELS];
	if (!Array.isArray(raw.models)) {
		warn("provider-openai: settings.decisions.models must be an array; using the default");
		return [...DEFAULT_DECISION_MODELS];
	}
	const models = raw.models.filter(
		(model): model is string => typeof model === "string" && model.trim().length > 0,
	).map((model) => model.trim());
	if (models.length !== raw.models.length) {
		warn("provider-openai: settings.decisions.models dropped entries that were not non-empty strings");
	}
	if (models.length === 0) {
		warn("provider-openai: settings.decisions.models left no usable entry; using the default");
		return [...DEFAULT_DECISION_MODELS];
	}
	return models;
}

function embeddingModels(raw: Section, warn: Warn): readonly OpenAIEmbeddingModelSettings[] {
	if (raw.models === undefined) return DEFAULT_EMBEDDING_MODELS.map((model) => ({ ...model }));
	if (!Array.isArray(raw.models)) {
		warn("provider-openai: settings.embeddings.models must be an array; using the default");
		return DEFAULT_EMBEDDING_MODELS.map((model) => ({ ...model }));
	}
	const models: OpenAIEmbeddingModelSettings[] = [];
	let dropped = false;
	for (const entry of raw.models) {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			dropped = true;
			continue;
		}
		const value = entry as Section;
		unknownKeys(value, ["id", "dimensions"], "settings.embeddings.models entry", warn);
		if (
			typeof value.id !== "string" || value.id.trim().length === 0 ||
			typeof value.dimensions !== "number" || !Number.isInteger(value.dimensions) || value.dimensions <= 0
		) {
			dropped = true;
			continue;
		}
		models.push({ id: value.id.trim(), dimensions: value.dimensions });
	}
	if (dropped) {
		warn("provider-openai: settings.embeddings.models dropped entries without a non-empty id and positive integer dimensions");
	}
	if (models.length === 0) {
		warn("provider-openai: settings.embeddings.models left no usable entry; using the default");
		return DEFAULT_EMBEDDING_MODELS.map((model) => ({ ...model }));
	}
	return models;
}

/** Parse one scoped settings snapshot without reading storage or the environment. */
export function parseSettings(raw: Record<string, unknown>, warn: Warn): OpenAIProviderSettings {
	unknownKeys(raw, ["baseUrl", "chat", "decisions", "embeddings"], "settings", warn);
	let baseUrl = DEFAULT_OPENAI_BASE_URL;
	if (raw.baseUrl !== undefined) {
		if (typeof raw.baseUrl === "string" && raw.baseUrl.length > 0) {
			baseUrl = raw.baseUrl;
		} else {
			warn("provider-openai: settings.baseUrl must be a non-empty string; using the default");
		}
	}

	const chat = section(raw, "chat", warn);
	unknownKeys(chat, ["enabled"], "settings.chat", warn);
	const decisions = section(raw, "decisions", warn);
	unknownKeys(decisions, ["enabled", "models"], "settings.decisions", warn);
	const embeddings = section(raw, "embeddings", warn);
	unknownKeys(embeddings, ["enabled", "models", "maxBatch"], "settings.embeddings", warn);

	let maxBatch = DEFAULT_EMBEDDING_MAX_BATCH;
	if (embeddings.maxBatch !== undefined) {
		if (
			typeof embeddings.maxBatch === "number" && Number.isInteger(embeddings.maxBatch) && embeddings.maxBatch > 0
		) {
			maxBatch = embeddings.maxBatch;
		} else {
			warn("provider-openai: settings.embeddings.maxBatch must be a positive integer; using the default");
		}
	}

	return {
		baseUrl,
		chat: { enabled: boolean(chat, "enabled", "chat", warn) },
		decisions: {
			enabled: boolean(decisions, "enabled", "decisions", warn),
			models: decisionModels(decisions, warn),
		},
		embeddings: {
			enabled: boolean(embeddings, "enabled", "embeddings", warn),
			models: embeddingModels(embeddings, warn),
			maxBatch,
		},
	};
}
