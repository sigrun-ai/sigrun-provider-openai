/** Structural slice of sigrun's seam host consumed by this provider. */
export interface OpenAIProviderHost {
    readonly settings: {
        declare<S = Record<string, unknown>, U = Record<string, unknown>>(decl: {
            readonly schema: Readonly<Record<string, unknown>>;
            readonly userSchema?: Readonly<Record<string, unknown>>;
        }): {
            get(): Promise<S>;
        };
    };
}
