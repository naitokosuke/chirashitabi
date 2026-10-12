import type { StyleSpecification } from "maplibre-gl";

/**
 * The map's style with its filters made safe for features that lack a property they compare.
 *
 * OpenFreeMap's styles filter with comparisons like `["<=", ["get", "ref_length"], 6]`; a road
 * with no `ref_length` reaches the comparison with null, which MapLibre treats as false (the
 * intended result) but warns about for every feature of every tile. Guarded as
 * `["all", ["has", "ref_length"], …]`, the comparison is never reached for such a feature,
 * and what is drawn is the same.
 */
export function guardMissingProperties(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) =>
      "filter" in layer && layer.filter !== undefined
        ? { ...layer, filter: guard(layer.filter) }
        : layer,
    ),
  };
}

const ORDERING = new Set(["<", "<=", ">", ">="]);

/** `["get", name]`'s name, when `v` is one */
const gotten = (v: unknown): string | null =>
  Array.isArray(v) && v.length === 2 && v[0] === "get" && typeof v[1] === "string" ? v[1] : null;

/** An expression with each ordering comparison of a property guarded by `has` */
const guard = <T>(expr: T): T =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a guarded filter is still one, which MapLibre's types cannot follow through the rewrite
  rewrite(expr) as T;

function rewrite(expr: unknown): unknown {
  if (!Array.isArray(expr)) return expr;
  const inner = expr.map(rewrite);
  if (typeof inner[0] === "string" && ORDERING.has(inner[0])) {
    const name = gotten(inner[1]) ?? gotten(inner[2]);
    if (name !== null) return ["all", ["has", name], inner];
  }
  return inner;
}
