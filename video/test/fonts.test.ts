import { describe, expect, test } from "bun:test";
import { DEFAULT_FONT, FONTS, resolveFont } from "../src/lib/snap-cn-ui/fonts";

describe("resolveFont", () => {
  test.each(["toString", "constructor", "__proto__", "hasOwnProperty"])(
    "passes inherited property name %s through as a string",
    (name) => {
      expect(resolveFont(name)).toBe(name);
    },
  );

  test("resolves registered fonts to their loaded family", () => {
    for (const [name, family] of Object.entries(FONTS)) {
      expect(resolveFont(name)).toBe(family);
    }
  });

  test("preserves custom font families and stacks", () => {
    expect(resolveFont("My Custom Font")).toBe("My Custom Font");
    expect(resolveFont('"Custom", sans-serif')).toBe('"Custom", sans-serif');
  });

  test("keeps the default and absent font behavior", () => {
    expect(resolveFont()).toBeUndefined();
    expect(resolveFont("")).toBeUndefined();
    expect(resolveFont(DEFAULT_FONT)).toBeUndefined();
  });
});
