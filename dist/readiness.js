/** The vendor's public API host: keyless use there is impossible. */
const PUBLIC_HOST = "api.openai.com";
/** One tracker instance per provider kind, over the kind's resolved baseUrl. */
export function createOpenAIReadiness(baseUrl) {
    const publicEndpoint = new URL(baseUrl).hostname === PUBLIC_HOST;
    let configured = !publicEndpoint;
    let failure;
    return {
        publicEndpoint,
        readiness() {
            if (!configured)
                return { status: "not_configured" };
            if (failure !== undefined)
                return { status: "degraded", detail: failure };
            return { status: "ready" };
        },
        noteCredential(credential) {
            if (credential !== undefined && credential !== "")
                configured = true;
        },
        noteSuccess() {
            failure = undefined;
        },
        noteFailure(message) {
            failure = message;
        },
    };
}
