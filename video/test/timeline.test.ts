import { describe, expect, mock, test } from "bun:test";

let frame = 0;
const remotion = await import("remotion");
mock.module("remotion", () => ({
  ...remotion,
  useCurrentFrame: () => frame,
  useVideoConfig: () => ({ fps: 30 }),
}));

const { revealedText, useTypewriter } = await import("../src/lib/snap-cn-ui/timeline");

describe("revealedText", () => {
  test.each(["😀", "👩🏽‍💻", "🇮🇳", "e\u0301"])(
    "reveals %s as one complete character",
    (character) => {
      const text = `A${character}B`;
      expect(revealedText(text, 1)).toBe("A");
      expect(revealedText(text, 2)).toBe(`A${character}`);
      expect(revealedText(text, 3)).toBe(text);
    },
  );

  test("clamps and floors counts while preserving ASCII behavior", () => {
    expect(revealedText("abc", -1)).toBe("");
    expect(revealedText("abc", 1.9)).toBe("a");
    expect(revealedText("abc", 99)).toBe("abc");
    expect(revealedText("", 1)).toBe("");
  });
});

describe("useTypewriter", () => {
  test("uses visible characters for reveal timing and completion", () => {
    const text = "A👩🏽‍💻🇮🇳e\u0301";
    const options = { cps: 1, speed: 2, startFrame: 30 };

    for (const current of [0, 14, 15]) {
      frame = current;
      expect(useTypewriter(text, options)).toEqual({
        text: "", count: 0, done: false, typing: false,
      });
    }

    for (const [index, visible] of ["A", "A👩🏽‍💻", "A👩🏽‍💻🇮🇳", text].entries()) {
      frame = 30 + index * 15;
      expect(useTypewriter(text, options)).toEqual({
        text: visible, count: index + 1, done: index === 3, typing: index < 3,
      });
    }

    frame = 500;
    expect(useTypewriter(text, options)).toEqual({
      text, count: 4, done: true, typing: false,
    });
  });

  test("empty text is complete before and after the start frame", () => {
    for (const current of [0, 100]) {
      frame = current;
      expect(useTypewriter("", { startFrame: 30 })).toEqual({
        text: "", count: 0, done: true, typing: false,
      });
    }
  });
});
