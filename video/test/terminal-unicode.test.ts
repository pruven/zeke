import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("command and output renderers reveal complete Unicode characters", () => {
  const result = spawnSync(process.execPath, ["-e", `
    import assert from "node:assert/strict";
    import {mock} from "bun:test";
    import {createElement} from "react";
    import {renderToStaticMarkup} from "react-dom/server";
    const remotion = await import("remotion");
    let frame = 0;
    mock.module("remotion", () => ({
      ...remotion,
      useCurrentFrame: () => frame,
      useVideoConfig: () => ({fps: 30, width: 1280, height: 720}),
    }));
    const {TerminalSimulator} = await import("./src/components/snap-cn/terminal-simulator");
    for (const character of ["😀", "👩🏽‍💻", "🇮🇳", "e\\u0301"]) {
      for (const command of [true, false]) {
        const text = "A" + character + "B";
        for (const [count, prefix] of [[1, "A"], [2, "A" + character], [3, text]]) {
          frame = (command ? 8 : 6) + count;
          const markup = renderToStaticMarkup(createElement(TerminalSimulator, {
            intro: null,
            command: command ? {text} : null,
            lines: command ? [] : [{text, type: "command", delay: 0}],
            charsPerFrame: 1,
            chunkSize: 1,
          }));
          assert.ok(markup.includes(">" + prefix + "</span>"), markup);
          assert.ok(markup.isWellFormed());
        }
      }
    }
  `], { cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 10000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
});
