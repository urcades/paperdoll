// @ts-expect-error paperdoll intentionally has no Node runtime/type dependency;
// this Node-only test uses vm solely to construct a genuinely separate realm.
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { MAX_PORTABLE_INTEGER, validatePortableJson } from "../src/index";

describe("paper-json-portable/v1", () => {
  it("accepts the exact integer boundary and ordinary binary64 values", () => {
    expect(MAX_PORTABLE_INTEGER).toBe(9_007_199_254_740_991);
    expect(
      validatePortableJson({
        minimum: -9_007_199_254_740_991,
        maximum: 9_007_199_254_740_991,
        integralDecimal: 1.0,
        fraction: 0.5,
        underflowedAtTheParsingBoundary: 0,
        negativeZero: -0
      })
    ).toEqual([]);
  });

  it("rejects unsafe integral numbers at their exact nested paths", () => {
    const errors = validatePortableJson({
      positive: 9_007_199_254_740_992,
      nested: [{ negative: -9_007_199_254_740_992 }]
    });

    expect(errors).toEqual([
      {
        path: "$.positive",
        message: "Integer must be between -9007199254740991 and 9007199254740991 for paper-json-portable/v1."
      },
      {
        path: "$.nested.0.negative",
        message: "Integer must be between -9007199254740991 and 9007199254740991 for paper-json-portable/v1."
      }
    ]);
  });

  it("is total over invalid host values and reports rather than throwing", () => {
    class HostClass {
      value = 1;
    }

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => validatePortableJson(cyclic)).not.toThrow();
    expect(validatePortableJson(cyclic)).toEqual([
      { path: "$.self", message: "Value must be finite, acyclic JSON for paper-json-portable/v1." }
    ]);

    expect(validatePortableJson([NaN, Infinity, 1n, new Date(0), new HostClass()])).toEqual([
      { path: "$.0", message: "Number must be finite for paper-json-portable/v1." },
      { path: "$.1", message: "Number must be finite for paper-json-portable/v1." },
      { path: "$.2", message: "Value must be finite, acyclic JSON for paper-json-portable/v1." },
      { path: "$.3", message: "Value must be finite, acyclic JSON for paper-json-portable/v1." },
      { path: "$.4", message: "Value must be finite, acyclic JSON for paper-json-portable/v1." }
    ]);
  });

  it("accepts JSON objects parsed in another JavaScript realm", () => {
    const crossRealm = runInNewContext('JSON.parse("{\\"nested\\":{\\"amount\\":1.5}}")') as unknown;
    expect(validatePortableJson(crossRealm)).toEqual([]);
  });

  it("allows repeated references when the value has no cycle", () => {
    const shared = { amount: 1 };
    expect(validatePortableJson({ left: shared, right: shared })).toEqual([]);
  });

  it("does not trust array methods and rejects missing own elements", () => {
    const overridden = [9_007_199_254_740_992];
    Object.defineProperty(overridden, "forEach", { value: () => undefined });

    const sparse = new Array(1);
    const inherited = new Array(1);
    const prototype = Object.create(Array.prototype) as unknown[];
    prototype[0] = 9_007_199_254_740_992;
    Object.setPrototypeOf(inherited, prototype);

    expect(validatePortableJson(overridden).map((error) => error.path)).toEqual(["$.0"]);
    expect(validatePortableJson(sparse)).toEqual([
      { path: "$.0", message: "Value must be finite, acyclic JSON for paper-json-portable/v1." }
    ]);
    expect(validatePortableJson(inherited)).toEqual([
      { path: "$.0", message: "Value must be finite, acyclic JSON for paper-json-portable/v1." }
    ]);
  });
});
