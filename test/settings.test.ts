import { describe, expect, it } from "vitest";
import { KNOWN_EMBEDDING_MODELS } from "../src/known-models.js";
import {
	DEFAULT_EMBEDDING_MAX_BATCH,
	DEFAULT_OPENAI_BASE_URL,
	parseSettings,
} from "../src/settings.js";

describe("parseSettings", () => {
	it("defaults", () => {
		const warnings: string[] = [];
		expect(parseSettings({}, (message) => warnings.push(message))).toEqual({
			baseUrl: "https://api.openai.com/v1",
			chat: { enabled: true },
			decisions: { enabled: true },
			embeddings: {
				enabled: true,
				maxBatch: 2048,
			},
		});
		expect(DEFAULT_OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
		expect(DEFAULT_EMBEDDING_MAX_BATCH).toBe(2048);
		expect(warnings).toEqual([]);
	});

	it("warns about unknown keys at every settings level", () => {
		const warnings: string[] = [];
		parseSettings(
			{
				unknown: true,
				chat: { unknown: true },
				decisions: { unknown: true },
				embeddings: { unknown: true },
			},
			(message) => warnings.push(message),
		);
		expect(warnings).toEqual([
			"provider-openai: unknown settings key \"unknown\"; ignoring",
			"provider-openai: unknown settings.chat key \"unknown\"; ignoring",
			"provider-openai: unknown settings.decisions key \"unknown\"; ignoring",
			"provider-openai: unknown settings.embeddings key \"unknown\"; ignoring",
		]);
	});

	it("an old settings file still loads", () => {
		// Pre-split files carried hand-maintained `models` lists in both the
		// decisions and embeddings sections. Those keys are now unknown (core's
		// Advanced pane lists them); the file must still load and the provider
		// must offer the built-in sets.
		const warnings: string[] = [];
		const settings = parseSettings(
			{
				baseUrl: "https://api.openai.com/v1",
				decisions: { models: ["gpt-6-luna", "gpt-other"] },
				embeddings: {
					models: [
						{ id: "text-embedding-3-small", dimensions: 1536 },
						{ id: "custom-embed", dimensions: 8 },
					],
					maxBatch: 512,
				},
			},
			(message) => warnings.push(message),
		);
		expect(settings.decisions).toEqual({ enabled: true });
		expect(settings.embeddings).toEqual({ enabled: true, maxBatch: 512 });
		expect(warnings).toEqual([
			"provider-openai: unknown settings.decisions key \"models\"; ignoring",
			"provider-openai: unknown settings.embeddings key \"models\"; ignoring",
		]);
		// The published sets no longer come from the file at all.
		expect(KNOWN_EMBEDDING_MODELS.map((model) => model.id)).toContain("text-embedding-3-small");
	});

	it("malformed settings warn and fall back per key", () => {
		const warnings: string[] = [];
		const settings = parseSettings(
			{
				baseUrl: 42,
				chat: { enabled: "yes" },
				decisions: { enabled: null },
				embeddings: { enabled: 1, maxBatch: 0 },
			},
			(message) => warnings.push(message),
		);
		expect(settings).toEqual({
			baseUrl: DEFAULT_OPENAI_BASE_URL,
			chat: { enabled: true },
			decisions: { enabled: true },
			embeddings: { enabled: true, maxBatch: 2048 },
		});
		expect(warnings.length).toBeGreaterThanOrEqual(4);
	});

	it("malformed baseUrl warns and falls back to the default", () => {
		const warnings: string[] = [];
		const settings = parseSettings({ baseUrl: "not a url" }, (message) => warnings.push(message));
		expect(settings.baseUrl).toBe(DEFAULT_OPENAI_BASE_URL);
		expect(warnings).toEqual(["provider-openai: settings.baseUrl is not a valid URL; using the default"]);
	});

	it("a settings section with the wrong shape uses its defaults", () => {
		const warnings: string[] = [];
		const settings = parseSettings(
			{ chat: false, decisions: [], embeddings: "bad" },
			(message) => warnings.push(message),
		);
		expect(settings.chat).toEqual({ enabled: true });
		expect(settings.decisions).toEqual({ enabled: true });
		expect(settings.embeddings.enabled).toBe(true);
		expect(warnings).toHaveLength(3);
	});
});
