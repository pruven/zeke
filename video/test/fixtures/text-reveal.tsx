import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TextReveal, type TextRevealProps } from "../../src/components/snap-cn/text-reveal";

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);

Object.assign(window, {
  updateTextReveal: (props: TextRevealProps) => root.render(
    <StrictMode><TextReveal fontFamily="serif" {...props} /></StrictMode>,
  ),
  unmountTextReveal: () => root.unmount(),
});
