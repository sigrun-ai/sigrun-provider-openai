/**
 * Scoped settings for settings/provider-openai.json. Invalid or unknown keys
 * warn and fall back per key; malformed settings never quarantine the plugin.
 *
 * Settings split (plan 3 Task 1): the model sets are no longer settings.
 * Decisions publish pi-ai's classifier catalog and embeddings publish
 * KNOWN_EMBEDDING_MODELS, both fixed at load; a stored `models` list in
 * either section is an unknown key here (core's Advanced pane lists it).
 */

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_EMBEDDING_MAX_BATCH = 2048;

export interface OpenAIProviderSettings {
	readonly baseUrl: string;
	readonly chat: { readonly enabled: boolean };
	readonly decisions: { readonly enabled: boolean };
	readonly embeddings: {
		readonly enabled: boolean;
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

/** Parse one scoped settings snapshot without reading storage or the environment. */
export function parseSettings(raw: Record<string, unknown>, warn: Warn): OpenAIProviderSettings {
	unknownKeys(raw, ["baseUrl", "chat", "decisions", "embeddings"], "settings", warn);
	let baseUrl = DEFAULT_OPENAI_BASE_URL;
	if (raw.baseUrl !== undefined) {
		if (typeof raw.baseUrl === "string" && raw.baseUrl.length > 0) {
			try {
				new URL(raw.baseUrl);
				baseUrl = raw.baseUrl;
			} catch {
				warn("provider-openai: settings.baseUrl is not a valid URL; using the default");
			}
		} else {
			warn("provider-openai: settings.baseUrl must be a non-empty string; using the default");
		}
	}

	const chat = section(raw, "chat", warn);
	unknownKeys(chat, ["enabled"], "settings.chat", warn);
	const decisions = section(raw, "decisions", warn);
	unknownKeys(decisions, ["enabled"], "settings.decisions", warn);
	const embeddings = section(raw, "embeddings", warn);
	unknownKeys(embeddings, ["enabled", "maxBatch"], "settings.embeddings", warn);

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
		decisions: { enabled: boolean(decisions, "enabled", "decisions", warn) },
		embeddings: {
			enabled: boolean(embeddings, "enabled", "embeddings", warn),
			maxBatch,
		},
	};
}
