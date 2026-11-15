import { expect, test } from "bun:test";
import { openBrowser } from "@remotion/renderer";
import { fileURLToPath } from "node:url";

test("TextReveal refreshes geometry and holds rendering until fonts and metrics are ready", async () => {
  const remotion = fileURLToPath(import.meta.resolve("remotion"));
  const bundle = await Bun.build({
    entrypoints: [new URL("./fixtures/text-reveal.tsx", import.meta.url).pathname],
    target: "browser",
    plugins: [{
      name: "remotion-measurement-test",
      setup(build) {
        build.onResolve({ filter: /^remotion$/ }, () => ({ path: "remotion", namespace: "test-remotion" }));
        build.onLoad({ filter: /.*/, namespace: "test-remotion" }, () => ({
          loader: "js",
          contents: `
            export * from ${JSON.stringify(remotion)};
            export const useCurrentFrame = () => 0;
            export const useVideoConfig = () => ({width: 1280, height: 720, fps: 30});
            let nextHandle = 0;
            window.measurementHolds = new Set();
            export const delayRender = () => {
              const handle = ++nextHandle;
              window.measurementHolds.add(handle);
              return handle;
            };
            export const continueRender = (handle) => window.measurementHolds.delete(handle);
          `,
        }));
      },
    }],
  });
  expect(bundle.success, String(bundle.logs)).toBe(true);
  const browser = await openBrowser("chrome", { logLevel: "error" });
  try {
    const page = await browser.newPage({
      context: () => null, logLevel: "error", indent: false,
      pageIndex: 0, onBrowserLog: null, onLog: () => {},
    });
    await page.evaluate(await bundle.outputs[0].text());
    const result = await page.evaluate(async () => {
      const win = window as any;
      const settle = async (expectReady = true) => {
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
        if (expectReady) {
          for (let i = 0; i < 120 && win.measurementHolds.size > 0; i++) {
            await new Promise(requestAnimationFrame);
          }
        }
      };
      const check = () => {
        const line = document.querySelector("span")!;
        const lead = line.firstElementChild as HTMLSpanElement;
        const baseline = line.lastElementChild as HTMLSpanElement;
        const ratio = line.offsetWidth > 0
          ? (lead.offsetLeft + lead.offsetWidth / 2) / line.offsetWidth : 0.5;
        const [originX, originY] = line.style.transformOrigin.split(" ").map(parseFloat);
        return {
          correct: Math.abs(originX / 100 - ratio) < 0.00001
            && originY === baseline.offsetTop
            && Math.abs(parseFloat(line.style.translate) - line.offsetWidth * (0.5 - ratio)) < 0.001,
          width: line.offsetWidth,
          holds: win.measurementHolds.size,
        };
      };
      let props = { text: "Meet Zeke" };
      win.updateTextReveal(props);
      await settle();
      const initial = check();
      const updates = [];
      for (const patch of [
        { text: "Different words with a longer ending" },
        { fontSize: 40 }, { fontWeight: 400 },
        { fontFamily: "monospace" }, { letterSpacing: "0.1em" },
      ]) {
        props = { ...props, ...patch };
        win.updateTextReveal(props);
        await settle();
        updates.push(check());
      }
      const updated = updates.at(-1)!;

      // A late font-metrics change should refresh an otherwise unchanged line.
      const style = document.createElement("style");
      style.textContent = ".late-font { font-family: serif !important; }";
      document.head.appendChild(style);
      document.querySelector("span")!.classList.add("late-font");
      document.fonts.dispatchEvent(new Event("loadingdone"));
      await settle();
      const lateFont = check();

      let releaseFonts!: () => void;
      let ready = new Promise<void>((resolve) => { releaseFonts = resolve; });
      Object.defineProperty(document.fonts, "ready", { configurable: true, get: () => ready });
      win.updateTextReveal({ text: "Waiting for a new font", fontSize: 54 });
      await settle(false);
      const held = win.measurementHolds.size > 0;
      releaseFonts();
      await settle();
      const afterFonts = check();

      ready = new Promise<void>(() => {});
      win.updateTextReveal({ text: "Unmount while waiting" });
      await settle(false);
      win.unmountTextReveal();
      await settle();
      return { initial, updates, updated, lateFont, held, afterFonts, unmountHolds: win.measurementHolds.size };
    });
    for (const state of [result.initial, ...result.updates, result.lateFont, result.afterFonts]) {
      expect(state.correct).toBe(true);
      expect(state.holds).toBe(0);
    }
    expect(result.initial.width).not.toBe(result.updated.width);
    expect(result.updated.width).not.toBe(result.lateFont.width);
    expect(result.held).toBe(true);
    expect(result.unmountHolds).toBe(0);
  } finally {
    await browser.close({ silent: true });
  }
}, 30000);
