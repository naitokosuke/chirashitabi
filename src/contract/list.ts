import * as v from "valibot";

/**
 * A list as an answer from elsewhere gives it: the entries `item` reads, the rest left out, and
 * no list at all an empty one; so one odd entry never loses the others
 */
export const listOf = <S extends v.GenericSchema>(item: S) =>
  v.pipe(
    v.fallback(v.array(v.unknown()), []),
    v.transform((raws): v.InferOutput<S>[] =>
      raws.flatMap((raw) => {
        const entry = v.safeParse(item, raw);
        return entry.success ? [entry.output] : [];
      }),
    ),
  );
