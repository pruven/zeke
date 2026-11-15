import { describe, expect, test } from "bun:test";
import {
  chunkedReveal,
  computeLineStarts,
  typingDuration,
} from "../src/components/snap-cn/terminal-simulator";

describe("terminal typing clock", () => {
  test("reveals whole chunks on each step and clamps to the text length", () => {
    expect(chunkedReveal(-1, 10, 2, 3)).toBe(0);
    expect(chunkedReveal(0, 10, 2, 3)).toBe(0);
    expect(chunkedReveal(0.49, 10, 2, 3)).toBe(0);
    expect(chunkedReveal(0.5, 10, 2, 3)).toBe(3);
    expect(chunkedReveal(1, 10, 2, 3)).toBe(6);
    expect(chunkedReveal(1.5, 10, 2, 3)).toBe(9);
    expect(chunkedReveal(2, 10, 2, 3)).toBe(10);
    expect(chunkedReveal(100, 10, 2, 3)).toBe(10);
    expect(chunkedReveal(100, 0, 2, 3)).toBe(0);
  });

  test("duration is the first complete frame, including a partial final chunk", () => {
    for (const length of [1, 3, 4, 10, 38]) {
      for (const rate of [0.1, 0.5, 1, 1.6, 2]) {
        for (const chunkSize of [1, 3, 5]) {
          const duration = typingDuration(length, rate, chunkSize);
          expect(chunkedReveal(duration - 1, length, rate, chunkSize)).toBeLessThan(length);
          expect(chunkedReveal(duration, length, rate, chunkSize)).toBe(length);
        }
      }
    }
    expect(typingDuration(4, 0.1, 3)).toBe(20);
    expect(typingDuration(0, 1, 3)).toBe(0);
  });

  test("next lines wait for completion, pauses and delays", () => {
    const lines = [
      { text: "abcd", type: "command" as const, delay: 0, pause: 7 },
      { text: "waiting...", type: "log" as const, delay: 3 },
      { text: "done", type: "success" as const, delay: 0 },
    ];
    const starts = computeLineStarts(lines, 0.1, 3, 5);
    expect(starts).toEqual([5, 35, 93]);
    for (let i = 0; i < lines.length - 1; i++) {
      expect(chunkedReveal(starts[i + 1] - starts[i], lines[i].text.length, 0.1, 3)).toBe(lines[i].text.length);
    }
  });

  test("schedules Unicode lines by visible characters", () => {
    const lines = [
      { text: "A👩🏽‍💻🇮🇳e\u0301", type: "command" as const, delay: 0 },
      { text: "done", type: "success" as const, delay: 0 },
    ];
    expect(computeLineStarts(lines, 1, 1, 0)).toEqual([0, 4]);
  });
});
