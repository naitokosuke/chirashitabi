// exported only so declarations that carry a brand (the Worker's API type) can name it
export declare const brand: unique symbol;

/** A `T` that only the code which checked or minted it can produce */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
