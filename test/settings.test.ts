import { describe, expect, it } from "vitest";
import {
	DEFAULT_OPENAI_BASE_URL,
	parseSettings,
} from "../src/settings.js";

describe("parseSettings", () => {
	it("defaults", () => {
		const warnings: string[] = [];
		expect(parseSettings({}, (message) => warnings.push(message))).toEqual({
			baseUrl: "https://api.openai.com/v1",
			chat: { enabled: true },
			decisions: { enabled: true, models: ["gpt-6-luna"] },
			embeddings: {
				enabled: true,
				models: [
					{ id: "text-embedding-3-small", dimensions: 1536 },
					{ id: "text-embedding-3-large", dimensions: 3072 },
				],
				maxBatch: 2048,
			},
		});
		expect(DEFAULT_OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
		expect(warnings).toEqual([]);
	});

	it("warns about unknown keys at every settings level", () => {
		const warnings: string[] = [];
		const settings = parseSettings(
			{
				unknown: true,
				chat: { unknown: true },
				decisions: { unknown: true },
				embeddings: {
					unknown: true,
					models: [{ id: "embed-test", dimensions: 8, unknown: true }],
				},
			},
			(message) => warnings.push(message),
		);
		expect(settings.embeddings.models).toEqual([
			{ id: "embed-test", dimensions: 8 },
		]);
		expect(warnings).toEqual([
			"provider-openai: unknown settings key \"unknown\"; ignoring",
			"provider-openai: unknown settings.chat key \"unknown\"; ignoring",
			"provider-openai: unknown settings.decisions key \"unknown\"; ignoring",
			"provider-openai: unknown settings.embeddings key \"unknown\"; ignoring",
			"provider-openai: unknown settings.embeddings.models entry key \"unknown\"; ignoring",
		]);
	});

	it("malformed settings warn and fall back per key", () => {
		const warnings: string[] = [];
		const settings = parseSettings(
			{
				baseUrl: 42,
				chat: { enabled: "yes" },
				decisions: { enabled: null, models: ["", "gpt-test", 42] },
				embeddings: {
					enabled: 1,
					models: [
						{ id: "", dimensions: 0 },
						{ id: "embed-test", dimensions: 8 },
						"bad",
					],
					maxBatch: 0,
				},
			},
			(message) => warnings.push(message),
		);
		expect(settings).toEqual({
			baseUrl: DEFAULT_OPENAI_BASE_URL,
			chat: { enabled: true },
			decisions: { enabled: true, models: ["gpt-test"] },
			embeddings: {
				enabled: true,
				models: [{ id: "embed-test", dimensions: 8 }],
				maxBatch: 2048,
			},
		});
		expect(warnings.length).toBeGreaterThanOrEqual(7);
	});

	it("malformed baseUrl warns and falls back to the default", () => {
		const warnings: string[] = [];
		const settings = parseSettings({ baseUrl: "not a url" }, (message) => warnings.push(message));
		expect(settings.baseUrl).toBe(DEFAULT_OPENAI_BASE_URL);
		expect(warnings).toEqual(["provider-openai: settings.baseUrl is not a valid URL; using the default"]);
	});

	it("duplicate decisions.models entries are deduped with a warning", () => {
		const warnings: string[] = [];
		const settings = parseSettings(
			{ decisions: { models: ["gpt-6-luna", "gpt-6-luna", "gpt-other"] } },
			(message) => warnings.push(message),
		);
		expect(settings.decisions.models).toEqual(["gpt-6-luna", "gpt-other"]);
		expect(warnings).toEqual(["provider-openai: settings.decisions.models dropped duplicate entries"]);
	});

	it("a settings section with the wrong shape uses its defaults", () => {
		const warnings: string[] = [];
		const settings = parseSettings(
			{ chat: false, decisions: [], embeddings: "bad" },
			(message) => warnings.push(message),
		);
		expect(settings.chat).toEqual({ enabled: true });
		expect(settings.decisions).toEqual({ enabled: true, models: ["gpt-6-luna"] });
		expect(settings.embeddings.enabled).toBe(true);
		expect(warnings).toHaveLength(3);
	});
});
