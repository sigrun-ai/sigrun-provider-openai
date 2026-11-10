import { isModelType } from "@earendil-works/pi-ai/models";
import { describe, expect, it } from "vitest";
import createOpenAIProvider from "../src/index.js";
import type { OpenAIProviderHost } from "../src/host.js";
import { DEFAULT_OPENAI_BASE_URL } from "../src/settings.js";

function fakeHost(settings: Record<string, unknown>): OpenAIProviderHost {
	return {
		settings: {
			declare: () => ({ get: async () => settings }),
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
		expect(result.name).toBe("provider-openai");
		expect(result.providers).toEqual([]);
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

	it("carries the shared readiness tracker, fed by auth resolution", async () => {
		const defaults = await createOpenAIProvider(fakeHost({}));
		const contribution = defaults.providers[0]!;
		// No call has carried a credential yet, and the default endpoint is the
		// vendor's own public API: not_configured (the shared display-only gap).
		expect(contribution.readiness?.()).toEqual({ status: "not_configured" });
		await contribution.provider.auth.apiKey!.resolve(authInput);
		expect(contribution.readiness?.()).toEqual({ status: "ready" });
		// A custom endpoint needs no credential at all: ready from the start.
		const custom = await createOpenAIProvider(
			fakeHost({ baseUrl: "http://127.0.0.1:11434/v1" }),
		);
		expect(custom.providers[0]!.readiness?.()).toEqual({ status: "ready" });
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
