export declare const isPackageName: (name: unknown) => name is string;
export declare function registryUrl(value: unknown, localTestRegistries?: readonly string[]): string;
/** npm and Git spellings of the same public repository have one comparison identity. */
export declare function repositoryIdentity(value: unknown): string | null;
export declare const digest: (value: unknown) => string;
export declare function frozen<T>(value: T): T;
