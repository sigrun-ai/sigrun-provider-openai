/**
 * The settings-split contract (plan 3 Task 1): no hand-maintained model
 * lists. Embeddings publish the static KNOWN_EMBEDDING_MODELS table with
 * its dimensions; decisions publish every pi-ai classifier catalog entry
 * with api "openai-decisions". The factory declares a display title and
 * the schema — now without either `models` list — still draws a form.
 */
import { describe, expect, it } from "vitest";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { isModelType } from "@earendil-works/pi-ai/models";
import { assertDrawable } from "@sigrun/sigrun/settings-schema";
import createOpenAIProvider from "../src/index.js";
import type { OpenAIProviderHost } from "../src/host.js";
import { KNOWN_EMBEDDING_MODELS } from "../src/known-models.js";
import { OPENAI_SETTINGS_JSON_SCHEMA } from "../src/settings-schema.js";

function fakeHost(settings: Record<string, unknown> = {}): OpenAIProviderHost {
	return {
		settings: {
			declare: () => ({ get: async () => settings }),
		},
	};
}

describe("settings split", () => {
	it("embeddings publish every known model with its dimensions", async () => {
		expect(KNOWN_EMBEDDING_MODELS).toEqual([
			{ id: "text-embedding-3-small", dimensions: 1536 },
			{ id: "text-embedding-3-large", dimensions: 3072 },
			{ id: "text-embedding-ada-002", dimensions: 1536 },
		]);
		const result = await createOpenAIProvider(fakeHost());
		const contribution = result.embeddingProviders?.[0];
		expect(contribution).toBeDefined();
		expect(contribution!.models.map((model) => ({ id: model.id, dimensions: model.dimensions })))
			.toEqual(KNOWN_EMBEDDING_MODELS.map((model) => ({ ...model })));
	});

	it("decisions publish the classifier catalog", async () => {
		// The expectation is pi-ai's own catalog, not a hand-maintained list:
		// every classifier entry with api "openai-decisions" must be offered.
		const base = openaiProvider();
		const expected = (base.getAllModels?.() ?? base.getModels())
			.filter((model) => isModelType(model, "classifier") && model.api === "openai-decisions")
			.map((model) => ({ id: model.id }));
		expect(expected.length).toBeGreaterThan(0);
		const result = await createOpenAIProvider(fakeHost());
		const contribution = result.decisionProviders?.[0];
		expect(contribution).toBeDefined();
		expect(contribution!.models).toEqual(expected);
	});

	it("schema is drawable", () => {
		// No property may fall back to a JSON box; the deleted `models` lists
		// are gone from the form (old stored keys surface on the Advanced pane).
		assertDrawable(OPENAI_SETTINGS_JSON_SCHEMA);
		const sections = OPENAI_SETTINGS_JSON_SCHEMA.properties;
		expect(sections.decisions.properties).not.toHaveProperty("models");
		expect(sections.embeddings.properties).not.toHaveProperty("models");
	});

	it("factory declares the OpenAI title", async () => {
		const result = await createOpenAIProvider(fakeHost());
		expect(result.title).toBe("OpenAI");
	});
});
