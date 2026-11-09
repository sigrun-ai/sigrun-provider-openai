import { describe, expect, it } from "vitest";
import { createOpenAIReadiness } from "../src/readiness.js";

const PUBLIC = "https://api.openai.com/v1";

describe("the shared provider readiness tracker", () => {
	it("reports not_configured on the public API until a credential is seen", () => {
		const tracker = createOpenAIReadiness(PUBLIC);
		expect(tracker.readiness()).toEqual({ status: "not_configured" });
		// A keyless call teaches it nothing.
		tracker.noteCredential(undefined);
		tracker.noteCredential("");
		expect(tracker.readiness()).toEqual({ status: "not_configured" });
		tracker.noteCredential("sk-test");
		expect(tracker.readiness()).toEqual({ status: "ready" });
	});

	it("is ready from the start on a custom endpoint (a keyless local server works)", () => {
		for (const baseUrl of [
			"http://127.0.0.1:11434/v1",
			"http://10.1.2.3/v1",
			"https://openai.example.invalid/v1",
		]) {
			expect(createOpenAIReadiness(baseUrl).readiness(), baseUrl).toEqual({ status: "ready" });
		}
	});

	it("a failure degrades it with the message until a success", () => {
		const tracker = createOpenAIReadiness(PUBLIC);
		tracker.noteCredential("sk-test");
		tracker.noteFailure("upstream 500");
		expect(tracker.readiness()).toEqual({ status: "degraded", detail: "upstream 500" });
		tracker.noteSuccess();
		expect(tracker.readiness()).toEqual({ status: "ready" });
	});

	it("a credential never un-learns, and not_configured wins over a failure", () => {
		const tracker = createOpenAIReadiness(PUBLIC);
		tracker.noteFailure("no API key");
		expect(tracker.readiness()).toEqual({ status: "not_configured" });
		tracker.noteCredential("sk-test");
		// The failure from the keyless attempt still stands until a success.
		expect(tracker.readiness()).toEqual({ status: "degraded", detail: "no API key" });
		tracker.noteSuccess();
		// A later keyless call does not un-learn the credential.
		tracker.noteCredential(undefined);
		expect(tracker.readiness()).toEqual({ status: "ready" });
	});
});
