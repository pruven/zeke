import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TextReveal, type TextRevealProps } from "../../src/components/snap-cn/text-reveal";
import { TextBuild, type TextBuildProps } from "../../src/components/snap-cn/text-build";

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
const buildHost = document.createElement("div");
buildHost.id = "text-build-test";
document.body.appendChild(buildHost);
const buildRoot = createRoot(buildHost);

function CheckedTextBuild(props: TextBuildProps) {
  Object.assign(window, { textBuildRendering: true });
  try {
    return TextBuild(props);
  } finally {
    Object.assign(window, { textBuildRendering: false });
  }
}

Object.assign(window, {
  updateTextReveal: (props: TextRevealProps) => root.render(
    <StrictMode><TextReveal fontFamily="serif" {...props} /></StrictMode>,
  ),
  unmountTextReveal: () => root.unmount(),
  updateTextBuild: (props: TextBuildProps) => buildRoot.render(
    <StrictMode><CheckedTextBuild {...props} /></StrictMode>,
  ),
  unmountTextBuild: () => buildRoot.unmount(),
});
