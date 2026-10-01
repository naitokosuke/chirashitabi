declare const brand: unique symbol;

/** A `T` that only the code which checked or minted it can produce */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
