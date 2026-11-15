import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("font imports and name enumeration stay lazy; family access loads once", () => {
  // Isolate mocked font loaders from the other tests and their module caches.
  const result = spawnSync(process.execPath, ["-e", `
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    const calls = [];
    const fonts = [
      ["Inter", "Inter"],
      ["Geist", "Geist"],
      ["SpaceGrotesk", "Space Grotesk"],
      ["Outfit", "Outfit"],
      ["Montserrat", "Montserrat"],
      ["InstrumentSerif", "Instrument Serif"],
    ];
    for (const [module, family] of fonts) {
      mock.module("@remotion/google-fonts/" + module, () => ({
        loadFont: (style, options) => {
          calls.push({family, style, options});
          return {fontFamily: family};
        },
      }));
    }
    const { FONTS, FONT_NAMES, resolveFont } = await import(
      "./src/lib/snap-cn-ui/fonts"
    );
    assert.deepEqual(Object.keys(FONTS), fonts.map(([, name]) => name));
    assert.deepEqual(FONT_NAMES, ["Default", ...Object.keys(FONTS)]);
    for (const name of [undefined, "", "Default", "toString", "constructor", "__proto__", "Custom, serif"]) {
      resolveFont(name);
    }
    assert.equal(calls.length, 0);
    assert.equal(FONTS.Inter, "Inter");
    assert.equal(FONTS.Inter, "Inter");
    assert.equal(resolveFont("Inter"), "Inter");
    assert.deepEqual(calls.map(({family}) => family), ["Inter"]);
    assert.equal(resolveFont("Instrument Serif"), "Instrument Serif");
    assert.equal(FONTS["Instrument Serif"], "Instrument Serif");
    assert.deepEqual(calls.map(({family}) => family), ["Inter", "Instrument Serif"]);
    assert.deepEqual(calls[0].options, {weights: ["400", "500", "600", "700"], subsets: ["latin"]});
    assert.deepEqual(calls[1].options, {weights: ["400"], subsets: ["latin"]});
    assert.ok(calls.every(({style}) => style === "normal"));
  `], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
});
