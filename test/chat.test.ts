import { isModelType } from "@earendil-works/pi-ai/models";
import { describe, expect, it } from "vitest";
import createOpenAIProvider from "../src/index.js";
import type { OpenAIProviderHost } from "../src/host.js";
import { DEFAULT_OPENAI_BASE_URL } from "../src/settings.js";

function fakeHost(settings: Record<string, unknown>): OpenAIProviderHost {
	return {
		stores: {
			settings: {
				get: async () => settings,
			},
		},
	};
}

const authInput = {
	ctx: {
		env: async () => undefined,
		fileExists: async () => false,
	},
	credential: { type: "api_key" as const, key: "test-key" },
	signal: AbortSignal.timeout(5_000),
};

describe("provider-openai chat", () => {
	it("chat disabled contributes no chat provider", async () => {
		const result = await createOpenAIProvider(
			fakeHost({ chat: { enabled: false } }),
		);
		expect(result).toEqual({ name: "provider-openai", providers: [] });
	});

	it("chat catalog has no classifier models", async () => {
		const result = await createOpenAIProvider(fakeHost({}));
		expect(result.providers).toHaveLength(1);
		const provider = result.providers[0]!.provider;
		const allModels = provider.getAllModels?.() ?? provider.getModels();
		expect(allModels.length).toBeGreaterThan(0);
		expect(
			allModels.some((model) => isModelType(model, "classifier")),
		).toBe(false);
		expect(provider.getModels().length).toBeGreaterThan(0);
	});

	it("baseUrl applies to chat", async () => {
		const custom = await createOpenAIProvider(
			fakeHost({ baseUrl: "https://openai.example.invalid/v1" }),
		);
		const provider = custom.providers[0]!.provider;
		const resolved = await provider.auth.apiKey!.resolve(authInput);
		expect(resolved?.auth).toEqual({
			apiKey: "test-key",
			baseUrl: "https://openai.example.invalid/v1",
		});

		const defaults = await createOpenAIProvider(fakeHost({}));
		const defaultResolved = await defaults.providers[0]!.provider.auth.apiKey!.resolve(
			authInput,
		);
		expect(defaultResolved?.auth.baseUrl).toBe(DEFAULT_OPENAI_BASE_URL);
		expect(defaultResolved?.auth.baseUrl).toBe("https://api.openai.com/v1");
	});
});
