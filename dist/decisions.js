/**
 * The OpenAI Decisions API as a sigrun decision provider. pi-ai's own
 * `classify` drops the per-level probabilities of score answers and
 * never throws, so this module builds the request body itself, posts it
 * with pi-ai's transport (`postClassifierRequest` — retries and bearer auth;
 * usage and answers are parsed locally), and parses the raw answers. The predicate-instructions
 * wording mirrors pi-ai's openai-decisions client.
 */
import { postClassifierRequest } from "@earendil-works/pi-ai/api/classifier-shared";
import { isModelType } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { createOpenAIReadiness } from "./readiness.js";
const LABEL = "OpenAI Decisions";
/** Cloudflare in front of api.openai.com answers 504 on very large inputs; retrying hits it again. */
const NO_RETRY_STATUSES = [504];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value) {
    return typeof value === "string" ? value : JSON.stringify(value);
}
/** One classifier catalog entry per configured model, with the settings baseUrl laid over it. */
function classifierModels(baseUrl, models, warn) {
    const base = openaiProvider();
    const catalog = (base.getAllModels?.() ?? base.getModels()).filter((model) => isModelType(model, "classifier") && model.api === "openai-decisions");
    const byId = new Map(catalog.map((model) => [model.id, model]));
    const usable = [];
    for (const id of models) {
        if (byId.has(id)) {
            usable.push(id);
        }
        else {
            warn(`provider-openai: no OpenAI Decisions classifier catalog entry for "${id}"; dropping it`);
        }
    }
    const ids = usable.length > 0 ? usable : catalog.map((model) => model.id);
    if (usable.length === 0) {
        warn("provider-openai: settings.decisions.models named no usable classifier model; using the default");
    }
    const result = new Map();
    for (const id of ids) {
        // postClassifierRequest posts to an explicit URL built like pi-ai's classify:
        // new URL("decisions", `${baseUrl without trailing slashes}/`).
        result.set(id, { ...byId.get(id), baseUrl });
    }
    return result;
}
function predicateInstructions(name, question) {
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
function wireQuestion(name, question) {
    const instructions = question.instructions === undefined ? name : text(question.instructions);
    if (question.type === "choice") {
        return {
            type: "choice",
            name,
            instructions,
            choices: Object.entries(question.criteria).map(([value, description]) => description === null || description === undefined
                ? { value }
                : { value, description: text(description) }),
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
function requiredNumber(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${LABEL} returned an invalid ${field}`);
    }
    return value;
}
function probabilities(value, key, id) {
    if (!Array.isArray(value))
        throw new Error(`${LABEL} returned invalid probabilities for ${id}`);
    return Object.fromEntries(value.map((entry) => {
        if (!isRecord(entry) || typeof entry[key] !== "string") {
            throw new Error(`${LABEL} returned invalid probabilities for ${id}`);
        }
        const name = entry[key];
        return [name, requiredNumber(entry.probability, `probability for ${id}.${name}`)];
    }));
}
function parseAnswer(id, question, answer) {
    if (answer.type === "refusal")
        throw new Error(`openai refused question ${id}`);
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
function parseAnswers(body, request, model) {
    if (!isRecord(body) || !Array.isArray(body.answers)) {
        throw new Error(`${LABEL} returned an unexpected response`);
    }
    const byName = new Map();
    for (const answer of body.answers) {
        if (isRecord(answer) && typeof answer.name === "string")
            byName.set(answer.name, answer);
    }
    const answers = {};
    for (const [id, question] of Object.entries(request.questions)) {
        const answer = byName.get(id);
        if (answer === undefined)
            throw new Error(`${LABEL} did not return an answer for ${id}`);
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
 * last call carried no credential and the endpoint is OpenAI's own host (a
 * keyless custom endpoint stays ready); a failed call marks the tracker
 * `degraded` until a success. `evaluate` throws for transport and answer
 * failures; core maps a throw to `failed`.
 */
export function createOpenAIDecisions(baseUrl, models, warn = () => { }) {
    const catalog = classifierModels(baseUrl, models, warn);
    // The shared three-state tracker (spec §3): every kind reports readiness
    // the same way, including the display-only gap before the first call.
    const readiness = createOpenAIReadiness(baseUrl);
    return {
        id: "openai",
        label: "OpenAI",
        credentialEnv: "OPENAI_API_KEY",
        models: [...catalog.keys()].map((id) => ({ id })),
        readiness: () => readiness.readiness(),
        async evaluate(request, ctx) {
            const model = catalog.get(ctx.model);
            if (model === undefined)
                throw new Error(`${LABEL} has no model "${ctx.model}"`);
            readiness.noteCredential(ctx.credential);
            if (readiness.publicEndpoint && ctx.credential === undefined) {
                throw new Error("OpenAI Decisions: no API key (auth.json openai or OPENAI_API_KEY)");
            }
            try {
                const body = await postClassifierRequest(LABEL, new URL("decisions", `${model.baseUrl.replace(/\/+$/u, "")}/`), model, {
                    model: model.id,
                    input: typeof request.state === "string" ? request.state : JSON.stringify(request.state),
                    questions: Object.entries(request.questions).map(([id, question]) => wireQuestion(id, question)),
                }, { apiKey: ctx.credential ?? "", signal: ctx.signal }, NO_RETRY_STATUSES);
                const answers = parseAnswers(body, request, model);
                readiness.noteSuccess();
                return answers;
            }
            catch (error) {
                readiness.noteFailure(error instanceof Error ? error.message : String(error));
                throw error;
            }
        },
    };
}
