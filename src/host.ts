/** Structural slice of sigrun's seam host consumed by this provider. */
export interface OpenAIProviderHost {
	readonly stores: {
		readonly settings: {
			get(): Promise<Record<string, unknown>>;
		};
	};
}
