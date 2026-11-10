/** Structural slice of sigrun's seam host consumed by this provider. */
export interface OpenAIProviderHost {
	readonly settings: {
		declare(
			decl: Readonly<{
				schema: Readonly<Record<string, unknown>>;
				userSchema?: Readonly<Record<string, unknown>>;
			}>,
		): { get(): Promise<Record<string, unknown>> };
	};
}
