import * as v from "valibot";

/**
 * A parser for a value from elsewhere: what `schema` reads it as (its brands and transforms
 * applied), or null when it is not one. The type is the schema's output, never claimed.
 */
export const parserOf =
  <S extends v.GenericSchema>(schema: S) =>
  (value: unknown): v.InferOutput<S> | null => {
    const result = v.safeParse(schema, value);
    return result.success ? result.output : null;
  };
