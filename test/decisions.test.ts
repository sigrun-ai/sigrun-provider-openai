import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { DecisionContext, DecisionProviderContribution } from "@sigrun/sigrun/extension";
import createOpenAIProvider from "../src/index.js";
import type { OpenAIProviderHost } from "../src/host.js";

function fakeHost(settings: Record<string, unknown>): OpenAIProviderHost {
	return {
		stores: {
			settings: {
				get: async () => settings,
			},
		},
	};
}

const servers: Server[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
		server.close(() => resolve());
	})));
});

interface CapturedRequest {
	readonly body: Record<string, unknown>;
}

/** A fake /v1/decisions endpoint that answers each question by echoing its type. */
async function fakeDecisionsServer(): Promise<{
	readonly baseUrl: string;
	readonly requests: CapturedRequest[];
}> {
	const requests: CapturedRequest[] = [];
	const server = createServer((req, res) => {
		if (req.method !== "POST" || req.url !== "/v1/decisions") {
			res.writeHead(404).end();
			return;
		}
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk;
		});
		req.on("end", () => {
			const body = JSON.parse(raw) as {
				readonly model: string;
				readonly input: unknown;
				readonly questions: ReadonlyArray<Record<string, unknown>>;
			};
			requests.push({ body: body as unknown as Record<string, unknown> });
			const answers = body.questions.map((question) => {
				const name = question.name as string;
				if (question.type === "predicate") {
					return { type: "predicate", name, probability: 0.75 };
				}
				if (question.type === "choice") {
					const choices = question.choices as ReadonlyArray<{ value: string }>;
					return {
						type: "choice",
						name,
						choice: choices[0]!.value,
						confidence: 0.9,
						probabilities: choices.map((entry, index) => ({
							value: entry.value,
							probability: index === 0 ? 0.8 : 0.2 / Math.max(choices.length - 1, 1),
						})),
					};
				}
				const levels = question.levels as ReadonlyArray<{ label: string }>;
				return {
					type: "score",
					name,
					score: 1,
					confidence: 0.6,
					probabilities: levels.map((level, index) => ({
						label: level.label,
						probability: index === 0 ? 0.3 : 0.7 / Math.max(levels.length - 1, 1),
					})),
				};
			});
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({
				answers,
				usage: { input_tokens: 10, output_tokens: 5 },
			}));
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	servers.push(server);
	const { port } = server.address() as AddressInfo;
	return { baseUrl: `http://127.0.0.1:${port}/v1`, requests };
}

async function contributionFor(
	settings: Record<string, unknown>,
): Promise<DecisionProviderContribution> {
	const result = await createOpenAIProvider(fakeHost(settings));
	const contributions = result.decisionProviders ?? [];
	expect(contributions).toHaveLength(1);
	return contributions[0]!;
}

function ctx(baseUrl: string): DecisionContext {
	void baseUrl;
	return {
		model: "gpt-6-luna",
		credential: "sk-test",
		signal: AbortSignal.timeout(10_000),
		caller: "test",
	};
}

describe("provider-openai decisions", () => {
	it("noul maps to predicate and back", async () => {
		const fake = await fakeDecisionsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		expect(contribution.id).toBe("openai");
		expect(contribution.label).toBe("[OI]");
		expect(contribution.credentialEnv).toBe("OPENAI_API_KEY");
		expect(contribution.models).toEqual([{ id: "gpt-6-luna" }]);

		const request: Parameters<DecisionProviderContribution["evaluate"]>[0] = {
			state: { note: "hello" },
			questions: { q1: { type: "noul", instructions: "Is the note friendly?" } },
		};
		const result = await contribution.evaluate(request, ctx(fake.baseUrl));
		const wireQuestion = (fake.requests[0]!.body.questions as ReadonlyArray<Record<string, unknown>>)[0]!;
		expect(wireQuestion).toEqual({
			type: "predicate",
			name: "q1",
			instructions: "Is the note friendly?",
		});
		expect(result.answers.q1).toEqual({ type: "noul", noul: 0.75 });
		expect(result.model).toBe("gpt-6-luna");
		expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
	});

	it("choice keeps option ids and probabilities", async () => {
		const fake = await fakeDecisionsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		const result = await contribution.evaluate({
			state: "a message",
			questions: {
				route: {
					type: "choice",
					instructions: "Pick a route",
					criteria: { billing: "Charges and payments", other: null },
				},
			},
		}, ctx(fake.baseUrl));
		const wireQuestion = (fake.requests[0]!.body.questions as ReadonlyArray<Record<string, unknown>>)[0]!;
		expect(wireQuestion).toEqual({
			type: "choice",
			name: "route",
			instructions: "Pick a route",
			choices: [
				{ value: "billing", description: "Charges and payments" },
				{ value: "other" },
			],
		});
		expect(result.answers.route).toEqual({
			type: "choice",
			choice: "billing",
			confidence: 0.9,
			probabilities: { billing: 0.8, other: 0.2 },
		});
	});

	it("score keeps level probabilities from the raw answer", async () => {
		const fake = await fakeDecisionsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		const result = await contribution.evaluate({
			state: { text: "tone" },
			questions: {
				tone: {
					type: "score",
					instructions: "Rate the tone",
					criteria: ["neutral", "angry"],
				},
			},
		}, ctx(fake.baseUrl));
		const wireQuestion = (fake.requests[0]!.body.questions as ReadonlyArray<Record<string, unknown>>)[0]!;
		expect(wireQuestion).toEqual({
			type: "score",
			name: "tone",
			instructions: "Rate the tone",
			levels: [{ label: "neutral" }, { label: "angry" }],
		});
		expect(result.answers.tone).toEqual({
			type: "score",
			score: 1,
			confidence: 0.6,
			probabilities: { neutral: 0.3, angry: 0.7 },
		});
	});

	it("non-string instructions and criteria are JSON-stringified", async () => {
		const fake = await fakeDecisionsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		await contribution.evaluate({
			state: "x",
			questions: {
				absent: { type: "noul" },
				structured: {
					type: "noul",
					instructions: { check: ["a", 1] },
					criteria: { true: { because: "yes" } },
				},
				route: {
					type: "choice",
					criteria: { one: { detail: 1 }, two: "plain", three: null },
				},
				tone: {
					type: "score",
					instructions: 42,
					criteria: ["low", { label: "high" }],
				},
			},
		}, ctx(fake.baseUrl));
		const questions = fake.requests[0]!.body.questions as ReadonlyArray<Record<string, unknown>>;
		expect(questions[0]).toEqual({ type: "predicate", name: "absent", instructions: "absent" });
		expect(questions[1]).toEqual({
			type: "predicate",
			name: "structured",
			instructions: '{"check":["a",1]}\n\nTrue means: {"because":"yes"}',
		});
		expect(questions[2]).toEqual({
			type: "choice",
			name: "route",
			instructions: "route",
			choices: [
				{ value: "one", description: '{"detail":1}' },
				{ value: "two", description: "plain" },
				{ value: "three" },
			],
		});
		expect(questions[3]).toEqual({
			type: "score",
			name: "tone",
			instructions: "42",
			levels: [{ label: "low" }, { label: '{"label":"high"}' }],
		});
	});

	it("noul criteria fold into the instructions", async () => {
		const fake = await fakeDecisionsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		await contribution.evaluate({
			state: "x",
			questions: {
				q: {
					type: "noul",
					instructions: "Is it done?",
					criteria: { true: "the work is complete", false: "work remains" },
				},
			},
		}, ctx(fake.baseUrl));
		const wireQuestion = (fake.requests[0]!.body.questions as ReadonlyArray<Record<string, unknown>>)[0]!;
		expect(wireQuestion.instructions).toBe(
			"Is it done?\n\nTrue means: the work is complete\nFalse means: work remains",
		);
	});

	it("string state is sent as text, object state as JSON", async () => {
		const fake = await fakeDecisionsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		await contribution.evaluate({
			state: "plain text",
			questions: { q: { type: "noul" } },
		}, ctx(fake.baseUrl));
		expect(fake.requests[0]!.body.input).toBe("plain text");

		const state = { nested: { list: [1, "two"] } };
		await contribution.evaluate({
			state,
			questions: { q: { type: "noul" } },
		}, ctx(fake.baseUrl));
		expect(fake.requests[1]!.body.input).toBe(JSON.stringify(state));
	});

	it("refusal fails naming the question", async () => {
		const server = createServer((req, res) => {
			let raw = "";
			req.on("data", (chunk) => {
				raw += chunk;
			});
			req.on("end", () => {
				const body = JSON.parse(raw) as { questions: ReadonlyArray<{ name: string }> };
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({
					answers: body.questions.map((question) => ({
						type: "refusal",
						name: question.name,
						reason: "unsafe",
					})),
				}));
			});
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		servers.push(server);
		const { port } = server.address() as AddressInfo;
		const contribution = await contributionFor({ baseUrl: `http://127.0.0.1:${port}/v1` });
		await expect(contribution.evaluate({
			state: "x",
			questions: { dangerous: { type: "noul", instructions: "Judge" } },
		}, ctx(""))).rejects.toThrow("openai refused question dangerous");
	});

	it("decisions disabled contributes nothing", async () => {
		const result = await createOpenAIProvider(fakeHost({ decisions: { enabled: false } }));
		expect(result.decisionProviders ?? []).toEqual([]);
	});
});
