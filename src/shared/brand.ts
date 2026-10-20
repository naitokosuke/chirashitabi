import type * as v from "valibot";

/**
 * A `T` that only the code which checked or minted it can produce: Valibot's brand, so a type
 * written here and one a schema puts out with `v.brand` are the same kind
 */
export type Brand<T, B extends string> = T & v.Brand<B>;
