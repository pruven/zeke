import { expect, test } from "bun:test";
import { measureWordSizes } from "../src/components/snap-cn/text-build";

test("word measurement uses fallback metrics when document has no body", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { body: null },
  });
  try {
    expect(measureWordSizes(["ab", "c"], "x", 40, 600)).toEqual([44, 22]);
    expect(measureWordSizes(["ab", "c"], "y", 40, 600)).toEqual([40, 40]);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
