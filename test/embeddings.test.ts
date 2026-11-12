import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type {
	EmbeddingContext,
	EmbeddingProviderContribution,
} from "@sigrun/sigrun/extension";
import { isLocalHost } from "../src/embeddings.js";
import createOpenAIProvider from "../src/index.js";
import type { OpenAIProviderHost } from "../src/host.js";

const KEY = "sk-test";
const DIMENSIONS = 1536;
/** The provider's per-request token budget (4 characters per token). */
const REQUEST_TOKEN_BUDGET = 300_000;

function fakeHost(settings: Record<string, unknown>): OpenAIProviderHost {
	return {
		settings: {
			declare: () => ({ get: async () => settings }),
		},
	};
}

const servers: Server[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
		server.close(() => resolve());
	})));
});

interface EmbeddingWireRequest {
	readonly model: string;
	readonly input: readonly string[];
	readonly authorization: string | undefined;
}

/** The provider's own estimate: 4 characters per token, rounded up per input. */
function estimateTokens(inputs: readonly string[]): number {
	return inputs.reduce((total, input) => total + Math.ceil(input.length / 4), 0);
}

/**
 * A fake `/v1/embeddings` endpoint. Each vector's first element carries the
 * first three characters of its input as a number, so a test can prove the
 * global input order across split requests; the wire lists the entries in
 * REVERSE order (each carrying its true `index`) so only an index-sorting
 * implementation passes.
 */
async function fakeEmbeddingsServer(options: {
	readonly dimensions?: number;
	readonly failTimes?: number;
	readonly failBody?: string;
} = {}): Promise<{ readonly baseUrl: string; readonly requests: EmbeddingWireRequest[] }> {
	const requests: EmbeddingWireRequest[] = [];
	let remainingFailures = options.failTimes ?? 0;
	const dimensions = options.dimensions ?? DIMENSIONS;
	const server = createServer((req, res) => {
		if (req.method !== "POST" || req.url !== "/v1/embeddings") {
			res.writeHead(404).end();
			return;
		}
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk;
		});
		req.on("end", () => {
			const body = JSON.parse(raw) as { readonly model: string; readonly input: readonly string[] };
			requests.push({
				model: body.model,
				input: body.input,
				authorization: req.headers.authorization,
			});
			if (remainingFailures > 0) {
				remainingFailures -= 1;
				res.writeHead(401, { "content-type": "application/json" });
				res.end(options.failBody ?? JSON.stringify({
					// A realistic provider error echoes both the key and the input.
					error: { message: `Incorrect API key provided: ${KEY} for input ${body.input.join(";")}` },
				}));
				return;
			}
			const data = body.input
				.map((text, index) => {
					const embedding = new Array<number>(dimensions).fill(0);
					embedding[0] = Number(text.slice(0, 3)) || 0;
					embedding[1] = text.length;
					return { object: "embedding", index, embedding };
				})
				.reverse();
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({
				object: "list",
				model: body.model,
				data,
				usage: { prompt_tokens: estimateTokens(body.input), total_tokens: estimateTokens(body.input) },
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
): Promise<EmbeddingProviderContribution> {
	const result = await createOpenAIProvider(fakeHost(settings));
	const contributions = result.embeddingProviders ?? [];
	expect(contributions).toHaveLength(1);
	return contributions[0]!;
}

function ctx(credential: string = KEY): EmbeddingContext {
	return { credential, signal: AbortSignal.timeout(30_000) };
}

/** A call carrying no credential at all (a keyless local endpoint). */
function keylessCtx(): EmbeddingContext {
	return { credential: undefined, signal: AbortSignal.timeout(30_000) };
}

describe("provider-openai embeddings", () => {
	it("public baseUrl reports local false", async () => {
		const contribution = await contributionFor({});
		expect(contribution.id).toBe("openai");
		expect(contribution.label).toBe("OpenAI");
		expect(contribution.credentialEnv).toBe("OPENAI_API_KEY");
		expect(contribution.models).toEqual([
			{ id: "text-embedding-3-small", dimensions: 1536, maxBatch: 2048, local: false },
			{ id: "text-embedding-3-large", dimensions: 3072, maxBatch: 2048, local: false },
			{ id: "text-embedding-ada-002", dimensions: 1536, maxBatch: 2048, local: false },
		]);
	});

	it("no key on the public API is not_configured; no key on a private host is ready", async () => {
		const publicContribution = await contributionFor({});
		expect(publicContribution.readiness?.()).toEqual({ status: "not_configured" });

		const fake = await fakeEmbeddingsServer();
		const privateContribution = await contributionFor({ baseUrl: fake.baseUrl });
		expect(privateContribution.readiness?.()).toEqual({ status: "ready" });
		// A keyless private endpoint still works: no credential goes on the wire.
		const response = await privateContribution.embed(
			{ model: "text-embedding-3-small", input: ["000"] },
			keylessCtx(),
		);
		expect(response.vectors).toHaveLength(1);
		expect(fake.requests[0]?.authorization).toBeUndefined();
	});

	it("private and loopback hosts report local true", async () => {
		const loopback = await fakeEmbeddingsServer();
		const localBaseUrls = [
			loopback.baseUrl,
			"http://localhost:11434/v1",
			"http://10.1.2.3/v1",
			"http://172.16.0.1/v1",
			"http://172.31.255.254/v1",
			"http://192.168.1.20/v1",
			"http://[::1]:8080/v1",
		];
		for (const baseUrl of localBaseUrls) {
			const contribution = await contributionFor({ baseUrl });
			expect(
				contribution.models.map((model) => model.local),
				baseUrl,
			).toEqual([true, true, true]);
		}
		for (const baseUrl of [
			"https://api.openai.com/v1",
			"http://8.8.8.8/v1",
			"http://172.15.0.1/v1",
		]) {
			const contribution = await contributionFor({ baseUrl });
			expect(
				contribution.models.map((model) => model.local),
				baseUrl,
			).toEqual([false, false, false]);
		}

		// The class predicate itself, including IPv4-mapped IPv6.
		for (const host of [
			"127.0.0.1",
			"127.9.9.9",
			"::1",
			"localhost",
			"10.0.0.7",
			"172.20.10.2",
			"192.168.0.1",
			"fc00::1",
			"fd12:3456:789a::1",
			"::ffff:127.0.0.1",
		]) {
			expect(isLocalHost(host), host).toBe(true);
		}
		for (const host of [
			"api.openai.com",
			"8.8.8.8",
			"172.15.0.1",
			"172.32.0.1",
			"192.169.0.1",
			"11.0.0.1",
			"0.0.0.0",
			"fe80::1",
			"",
		]) {
			expect(isLocalHost(host), host).toBe(false);
		}
	});

	it("vectors return in index order", async () => {
		const fake = await fakeEmbeddingsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		const response = await contribution.embed(
			{ model: "text-embedding-3-small", input: ["000", "001", "002"] },
			ctx(),
		);
		expect(fake.requests).toHaveLength(1);
		expect(fake.requests[0]?.model).toBe("text-embedding-3-small");
		expect(fake.requests[0]?.authorization).toBe(`Bearer ${KEY}`);
		expect(response.vectors.map((vector) => vector[0])).toEqual([0, 1, 2]);
		for (const vector of response.vectors) expect(vector).toHaveLength(DIMENSIONS);
	});

	it("large inputs split under the token budget", async () => {
		const fake = await fakeEmbeddingsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		// Eleven 120,000-character inputs: 30,000 estimated tokens each.
		const input = Array.from({ length: 11 }, (_, index) =>
			String(index).padStart(3, "0") + "a".repeat(119_997)
		);
		const response = await contribution.embed({ model: "text-embedding-3-small", input }, ctx());
		expect(fake.requests.length).toBeGreaterThan(1);
		expect(fake.requests.flatMap((request) => request.input)).toEqual(input);
		for (const request of fake.requests) {
			expect(estimateTokens(request.input)).toBeLessThanOrEqual(REQUEST_TOKEN_BUDGET);
		}
		expect(response.vectors.map((vector) => vector[0])).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
	});

	it("a caller abort is a cancellation, not a provider failure", async () => {
		const server = createServer((req, res) => {
			req.on("data", () => {});
			// Hold the response open: the caller abandons the request.
			req.on("end", () => {
				res.on("close", () => {});
			});
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		servers.push(server);
		const { port } = server.address() as AddressInfo;
		const contribution = await contributionFor({ baseUrl: `http://127.0.0.1:${port}/v1` });
		expect(contribution.readiness?.()).toEqual({ status: "ready" });
		const controller = new AbortController();
		const pending = contribution.embed(
			{ model: "text-embedding-3-small", input: ["000"] },
			{ credential: KEY, signal: controller.signal },
		);
		setTimeout(() => controller.abort(), 20);
		const error = await pending.then(() => undefined, (thrown: unknown) => thrown);
		expect((error as { name?: string }).name).toBe("AbortError");
		// A cancellation says nothing about the provider's health.
		expect(contribution.readiness?.()).toEqual({ status: "ready" });
	});

	it("the incoming batch size splits requests too", async () => {
		const fake = await fakeEmbeddingsServer();
		const contribution = await contributionFor({
			baseUrl: fake.baseUrl,
			embeddings: { maxBatch: 2 },
		});
		const input = ["000", "001", "002", "003", "004"];
		const response = await contribution.embed({ model: "text-embedding-3-small", input }, ctx());
		expect(fake.requests.map((request) => request.input)).toEqual([
			["000", "001"],
			["002", "003"],
			["004"],
		]);
		expect(response.vectors.map((vector) => vector[0])).toEqual([0, 1, 2, 3, 4]);
	});

	it("an input at the token budget is sent alone, not merged", async () => {
		const fake = await fakeEmbeddingsServer();
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		// 1,200,000 characters = 300,000 estimated tokens: exactly the budget.
		const huge = "000" + "a".repeat(1_199_997);
		const response = await contribution.embed(
			{ model: "text-embedding-3-small", input: [huge, "001"] },
			ctx(),
		);
		expect(fake.requests.map((request) => request.input.length)).toEqual([1, 1]);
		expect(response.vectors.map((vector) => vector[0])).toEqual([0, 1]);
	});

	it("non-2xx throws without the key in the message", async () => {
		const fake = await fakeEmbeddingsServer({ failTimes: 1 });
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		const error = await contribution
			.embed({ model: "text-embedding-3-small", input: ["000"] }, ctx())
			.then(() => undefined, (thrown: unknown) => thrown);
		expect(error).toBeInstanceOf(Error);
		const message = (error as Error).message;
		expect(message).toContain("401");
		expect(message).not.toContain(KEY);
		expect(message).not.toContain("000");
		// The readiness detail is the same text: still scrubbed.
		expect(contribution.readiness?.().detail).not.toContain(KEY);
	});

	it("a malformed response throws instead of returning misaligned vectors", async () => {
		const server = createServer((req, res) => {
			req.on("data", () => {});
			req.on("end", () => {
				res.writeHead(200, { "content-type": "application/json" });
				// Two inputs, one vector.
				res.end(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }] }));
			});
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		servers.push(server);
		const { port } = server.address() as AddressInfo;
		const contribution = await contributionFor({ baseUrl: `http://127.0.0.1:${port}/v1` });
		await expect(
			contribution.embed({ model: "text-embedding-3-small", input: ["000", "001"] }, ctx()),
		).rejects.toThrow(/1 vectors for 2 inputs/u);
	});

	it("a transport failure still degrades readiness", async () => {
		// A port nothing listens on: ECONNREFUSED, a real provider failure.
		const dead = await contributionFor({ baseUrl: "http://127.0.0.1:1/v1" });
		await expect(
			dead.embed({ model: "text-embedding-3-small", input: ["000"] }, ctx()),
		).rejects.toThrow();
		expect(dead.readiness?.().status).toBe("degraded");
	});

	it("a failed call degrades readiness until a success", async () => {
		const fake = await fakeEmbeddingsServer({ failTimes: 1 });
		const contribution = await contributionFor({ baseUrl: fake.baseUrl });
		expect(contribution.readiness?.()).toEqual({ status: "ready" });
		await expect(
			contribution.embed({ model: "text-embedding-3-small", input: ["000"] }, ctx()),
		).rejects.toThrow(/401/u);
		expect(contribution.readiness?.().status).toBe("degraded");
		await contribution.embed({ model: "text-embedding-3-small", input: ["000"] }, ctx());
		expect(contribution.readiness?.()).toEqual({ status: "ready" });
	});

	it("a keyless call on the public API is refused before any request", async () => {
		const contribution = await contributionFor({});
		await expect(
			contribution.embed({ model: "text-embedding-3-small", input: ["000"] }, keylessCtx()),
		).rejects.toThrow(/no API key/u);
		// The tracker learned nothing from a keyless attempt.
		expect(contribution.readiness?.()).toEqual({ status: "not_configured" });
	});

	it("maxBatch reaches the contribution; a stored models list is an unknown key", async () => {
		const contribution = await contributionFor({
			embeddings: { models: [{ id: "custom-embed", dimensions: 8 }], maxBatch: 3 },
		});
		expect(contribution.models).toEqual([
			{ id: "text-embedding-3-small", dimensions: 1536, maxBatch: 3, local: false },
			{ id: "text-embedding-3-large", dimensions: 3072, maxBatch: 3, local: false },
			{ id: "text-embedding-ada-002", dimensions: 1536, maxBatch: 3, local: false },
		]);
	});

	it("embeddings disabled contributes nothing", async () => {
		const result = await createOpenAIProvider(fakeHost({ embeddings: { enabled: false } }));
		expect(result.embeddingProviders ?? []).toEqual([]);
	});
});
