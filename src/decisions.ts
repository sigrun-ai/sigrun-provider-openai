/**
 * The [OI] Decisions API as a sigrun decision provider. pi-ai's own
 * `classify` drops the per-level probabilities of score answers and
 * never throws, so this module builds the request body itself, posts it
 * with pi-ai's transport (`postClassifierRequest` — retries and bearer auth;
 * usage and answers are parsed locally), and parses the raw answers. The predicate-instructions
 * wording mirrors pi-ai's openai-decisions client.
 */
import { postClassifierRequest } from "@earendil-works/pi-ai/api/classifier-shared";
import { isModelType } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import type { ClassifierApi, ClassifierModel } from "@earendil-works/pi-ai";
import type {
	DecisionContext,
	DecisionProviderContribution,
	ProviderReadiness,
} from "@sigrun/sigrun/extension";

/**
 * Local mirrors of the `@sigrun/shared/decisions` leaf types (that package is
 * not a dependency of this plugin; the shared leaf is type-only, so the shapes
 * are declared here exactly the way `host.ts` declares the host slice).
 */
type DecisionJsonValue =
	| null
	| boolean
	| number
	| string
	| DecisionJsonValue[]
	| { [key: string]: DecisionJsonValue };
type DecisionState = string | { [key: string]: DecisionJsonValue } | DecisionJsonValue[];
type DecisionQuestion =
	| {
			readonly type: "noul";
			readonly instructions?: DecisionJsonValue;
			readonly criteria?: { readonly true?: DecisionJsonValue; readonly false?: DecisionJsonValue } | null;
	  }
	| {
			readonly type: "choice";
			readonly instructions?: DecisionJsonValue;
			readonly criteria: Readonly<Record<string, DecisionJsonValue | null>>;
	  }
	| {
			readonly type: "score";
			readonly instructions?: DecisionJsonValue;
			readonly criteria: readonly DecisionJsonValue[];
	  };
interface DecisionRequest {
	readonly state: DecisionState;
	readonly questions: Readonly<Record<string, DecisionQuestion>>;
}
type DecisionAnswer =
	| { readonly type: "noul"; readonly noul: number }
	| {
			readonly type: "choice";
			readonly choice: string;
			readonly confidence: number;
			readonly probabilities: Readonly<Record<string, number>>;
	  }
	| {
			readonly type: "score";
			readonly score: number;
			readonly confidence: number;
			readonly probabilities: Readonly<Record<string, number>>;
			readonly legend?: Readonly<Record<string, DecisionJsonValue>>;
	  };
interface DecisionAnswers {
	readonly answers: Readonly<Record<string, DecisionAnswer>>;
	readonly usage?: {
		readonly input_tokens: number | null;
		readonly output_tokens: number | null;
	};
	readonly model?: string;
}

const LABEL = "[OI] Decisions";
/** Cloudflare in front of api.openai.com answers 504 on very large inputs; retrying hits it again. */
const NO_RETRY_STATUSES = [504];

type DecisionModels = readonly string[];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: DecisionJsonValue): string {
	return typeof value === "string" ? value : JSON.stringify(value);
}

/** One classifier catalog entry per configured model, with the settings baseUrl laid over it. */
function classifierModels(
	baseUrl: string,
	models: DecisionModels,
	warn: (message: string) => void,
): Map<string, ClassifierModel<ClassifierApi>> {
	const base = openaiProvider();
	const catalog = (base.getAllModels?.() ?? base.getModels()).filter(
		(model): model is ClassifierModel<ClassifierApi> =>
			isModelType(model, "classifier") && model.api === "openai-decisions",
	);
	const byId = new Map(catalog.map((model) => [model.id, model]));
	const usable: string[] = [];
	for (const id of models) {
		if (byId.has(id)) {
			usable.push(id);
		} else {
			warn(`provider-openai: no [OI] Decisions classifier catalog entry for "${id}"; dropping it`);
		}
	}
	const ids = usable.length > 0 ? usable : catalog.map((model) => model.id);
	if (usable.length === 0) {
		warn("provider-openai: settings.decisions.models named no usable classifier model; using the default");
	}
	const result = new Map<string, ClassifierModel<ClassifierApi>>();
	for (const id of ids) {
		// postClassifierRequest posts to an explicit URL built like pi-ai's classify:
		// new URL("decisions", `${baseUrl without trailing slashes}/`).
		result.set(id, { ...byId.get(id)!, baseUrl });
	}
	return result;
}

function predicateInstructions(name: string, question: Extract<DecisionQuestion, { type: "noul" }>): string {
	const instructions = question.instructions === undefined ? name : text(question.instructions);
	const meanings = [
		question.criteria?.true !== undefined && question.criteria.true !== null
			? `True means: ${text(question.criteria.true)}`
			: "",
		question.criteria?.false !== undefined && question.criteria.false !== null
			? `False means: ${text(question.criteria.false)}`
			: "",
	].filter(Boolean);
	return meanings.length > 0 ? `${instructions}\n\n${meanings.join("\n")}` : instructions;
}

function wireQuestion(name: string, question: DecisionQuestion): Record<string, unknown> {
	const instructions = question.instructions === undefined ? name : text(question.instructions);
	if (question.type === "choice") {
		return {
			type: "choice",
			name,
			instructions,
			choices: Object.entries(question.criteria).map(([value, description]) =>
				description === null || description === undefined
					? { value }
					: { value, description: text(description) }
			),
		};
	}
	if (question.type === "score") {
		return {
			type: "score",
			name,
			instructions,
			levels: question.criteria.map((label) => ({ label: text(label) })),
		};
	}
	return { type: "predicate", name, instructions: predicateInstructions(name, question) };
}

function requiredNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${LABEL} returned an invalid ${field}`);
	}
	return value;
}

function probabilities(value: unknown, key: "value" | "label", id: string): Record<string, number> {
	if (!Array.isArray(value)) throw new Error(`${LABEL} returned invalid probabilities for ${id}`);
	return Object.fromEntries(value.map((entry) => {
		if (!isRecord(entry) || typeof entry[key] !== "string") {
			throw new Error(`${LABEL} returned invalid probabilities for ${id}`);
		}
		const name = entry[key] as string;
		return [name, requiredNumber(entry.probability, `probability for ${id}.${name}`)];
	}));
}

function parseAnswer(id: string, question: DecisionQuestion, answer: Record<string, unknown>): DecisionAnswer {
	if (answer.type === "refusal") throw new Error(`openai refused question ${id}`);
	if (question.type === "choice") {
		if (answer.type !== "choice" || typeof answer.choice !== "string") {
			throw new Error(`${LABEL} did not return a choice answer for ${id}`);
		}
		return {
			type: "choice",
			choice: answer.choice,
			confidence: requiredNumber(answer.confidence, `confidence for ${id}`),
			probabilities: probabilities(answer.probabilities, "value", id),
		};
	}
	if (question.type === "score") {
		if (answer.type !== "score") {
			throw new Error(`${LABEL} did not return a score answer for ${id}`);
		}
		return {
			type: "score",
			score: requiredNumber(answer.score, `score for ${id}`),
			confidence: requiredNumber(answer.confidence, `confidence for ${id}`),
			probabilities: probabilities(answer.probabilities, "label", id),
		};
	}
	if (answer.type !== "predicate") {
		throw new Error(`${LABEL} did not return a predicate answer for ${id}`);
	}
	return { type: "noul", noul: requiredNumber(answer.probability, `probability for ${id}`) };
}

function parseAnswers(body: unknown, request: DecisionRequest, model: ClassifierModel<ClassifierApi>): DecisionAnswers {
	if (!isRecord(body) || !Array.isArray(body.answers)) {
		throw new Error(`${LABEL} returned an unexpected response`);
	}
	const byName = new Map<string, Record<string, unknown>>();
	for (const answer of body.answers) {
		if (isRecord(answer) && typeof answer.name === "string") byName.set(answer.name, answer);
	}
	const answers: Record<string, DecisionAnswer> = {};
	for (const [id, question] of Object.entries(request.questions)) {
		const answer = byName.get(id);
		if (answer === undefined) throw new Error(`${LABEL} did not return an answer for ${id}`);
		answers[id] = parseAnswer(id, question, answer);
	}
	const usage = isRecord(body.usage) ? body.usage : undefined;
	return {
		answers,
		model: typeof body.model === "string" ? body.model : model.id,
		usage: usage === undefined
			? undefined
			: {
				input_tokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
				output_tokens: typeof usage.output_tokens === "number" ? usage.output_tokens : null,
			},
	};
}

/**
 * The decision-provider contribution. Readiness is `not_configured` when the
 * last call carried no credential and the endpoint is [OI]'s own host (a
 * keyless custom endpoint stays ready); a failed call marks the tracker
 * `degraded` until a success. `evaluate` throws for transport and answer
 * failures; core maps a throw to `failed`.
 */
export function createOpenAIDecisions(
	baseUrl: string,
	models: DecisionModels,
	warn: (message: string) => void = () => {},
): DecisionProviderContribution {
	const catalog = classifierModels(baseUrl, models, warn);
	const openaiHosted = new URL(baseUrl).hostname === "api.openai.com";
	let configured = !openaiHosted;
	let failed: string | undefined;

	function readiness(): ProviderReadiness {
		if (!configured) return { status: "not_configured" };
		if (failed !== undefined) return { status: "degraded", detail: failed };
		return { status: "ready" };
	}

	return {
		id: "openai",
		label: "OpenAI",
		credentialEnv: "OPENAI_API_KEY",
		models: [...catalog.keys()].map((id) => ({ id })),
		readiness,
		async evaluate(request: DecisionRequest, ctx: DecisionContext): Promise<DecisionAnswers> {
			const model = catalog.get(ctx.model);
			if (model === undefined) throw new Error(`${LABEL} has no model "${ctx.model}"`);
			if (ctx.credential !== undefined) configured = true;
			if (ctx.credential === undefined && openaiHosted) {
				throw new Error("[OI] Decisions: no API key (auth.json openai or OPENAI_API_KEY)");
			}
			try {
				const body = await postClassifierRequest(
					LABEL,
					new URL("decisions", `${model.baseUrl.replace(/\/+$/u, "")}/`),
					model,
					{
						model: model.id,
						input: typeof request.state === "string" ? request.state : JSON.stringify(request.state),
						questions: Object.entries(request.questions).map(([id, question]) => wireQuestion(id, question)),
					},
					{ apiKey: ctx.credential ?? "", signal: ctx.signal },
					NO_RETRY_STATUSES,
				);
				const answers = parseAnswers(body, request, model);
				failed = undefined;
				return answers;
			} catch (error) {
				failed = error instanceof Error ? error.message : String(error);
				throw error;
			}
		},
	};
}
