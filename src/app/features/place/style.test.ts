import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, test } from "vite-plus/test";

import { guardMissingProperties } from "./style";

const styleWith = (layers: unknown[]) =>
  ({ version: 8, sources: {}, layers }) as unknown as StyleSpecification;

describe("guardMissingProperties", () => {
  test("a comparison of a property is reached only for a feature that has it", () => {
    const [shield] = guardMissingProperties(
      styleWith([
        {
          id: "highway-shield-non-us",
          type: "symbol",
          filter: [
            "all",
            ["<=", ["get", "ref_length"], 6],
            ["match", ["get", "network"], ["us-highway"], false, true],
          ],
        },
      ]),
    ).layers;
    expect(shield).toMatchObject({
      filter: [
        "all",
        ["all", ["has", "ref_length"], ["<=", ["get", "ref_length"], 6]],
        ["match", ["get", "network"], ["us-highway"], false, true],
      ],
    });
  });

  test("the property may be on either side", () => {
    const [layer] = guardMissingProperties(
      styleWith([{ id: "b", type: "line", filter: [">=", 3, ["get", "admin_level"]] }]),
    ).layers;
    expect(layer).toMatchObject({
      filter: ["all", ["has", "admin_level"], [">=", 3, ["get", "admin_level"]]],
    });
  });

  test("other filters, and layers without one, are as they were", () => {
    const layers = [
      { id: "a", type: "line", filter: ["!=", ["get", "maritime"], 1] },
      { id: "bg", type: "background" },
      { id: "c", type: "line", filter: ["<", ["zoom"], 5] },
    ];
    expect(guardMissingProperties(styleWith(layers)).layers).toEqual(layers);
  });
});
