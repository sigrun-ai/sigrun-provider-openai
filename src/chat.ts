import type { Provider } from "@earendil-works/pi-ai";
import { isModelType } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import type { ProviderContribution } from "@sigrun/sigrun/extension";
import { createOpenAIReadiness } from "./readiness.js";

/**
 * pi-ai's [OI] provider with a chat-only catalog and a per-request base URL.
 *
 * The contribution carries the plugin's shared readiness tracker, fed by
 * the auth resolution pi-ai performs before every request: a resolved
 * apiKey is the plugin's only evidence that a credential exists (it cannot
 * read `auth.json`). Chat requests themselves fail inside pi-ai's stream,
 * which this plugin never observes, so chat readiness reports
 * `not_configured` until the first authenticated request and stays `ready`
 * afterwards — the same display-only limitation every kind shares.
 */
export function createOpenAIChat(baseUrl: string): ProviderContribution {
	const readiness = createOpenAIReadiness(baseUrl);
	const base = openaiProvider();
	const models = (base.getAllModels?.() ?? base.getModels()).filter(
		(model) => !isModelType(model, "classifier"),
	);
	const provider: Provider<"openai-responses"> = {
		...base,
		auth: {
			...base.auth,
			...(base.auth.apiKey === undefined ? {} : {
				apiKey: {
					...base.auth.apiKey,
					resolve: async (input) => {
						const resolved = await base.auth.apiKey!.resolve(input);
						if (resolved !== undefined && typeof resolved.auth?.apiKey === "string") {
							readiness.noteCredential(resolved.auth.apiKey);
						}
						return resolved === undefined
							? undefined
							: { ...resolved, auth: { ...resolved.auth, baseUrl } };
					},
				},
			}),
		},
		getModels: () => models.filter((model) => isModelType(model, "chat")),
		getAllModels: () => models,
	};
	return { provider, readiness: () => readiness.readiness() };
}
