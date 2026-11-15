import React from "react";
import { AbsoluteFill, Composition, Easing, interpolate, Sequence, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { TextBuild } from "./components/snap-cn/text-build";
import { TextReveal } from "./components/snap-cn/text-reveal";
import { TerminalSimulator, type TerminalLine } from "./components/snap-cn/terminal-simulator";
import { FONTS, SnapCnUIProvider } from "./lib/snap-cn-ui";

const bg = "#0a0a0b";
const green = "#22c55e";
const muted = "#a1a1aa";
export const durationInFrames = 792;

const Shell: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <AbsoluteFill style={{ background: bg, color: "#fafafa", fontFamily: FONTS.Inter }}>
    <div style={{ position: "absolute", top: 38, left: 56, right: 56, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
      <span style={{ fontSize: 28, fontWeight: 700 }}>zeke<span style={{ color: green }}>.</span></span>
      <span style={{ fontSize: 17, color: muted }}>{label}</span>
    </div>
    {children}
    <div style={{ position: "absolute", bottom: 36, left: 56, right: 56, height: 1, background: "#26272b" }} />
  </AbsoluteFill>
);

const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", top: 475, left: 56, right: 56, textAlign: "center", color: muted, fontSize: 26 }}>{children}</div>
);

const Hook = () => (
  <Shell label="For your T3 Code workflow">
    <TextBuild text="T3 Code worktree. Missing .env?" fontSize={60} fontFamily="Inter" mode="dark" />
    <Sequence from={76}><Caption>A fresh worktree. Another manual .env copy.</Caption></Sequence>
  </Shell>
);

const Intro = () => (
  <Shell label="Meet Zeke">
    <TextReveal text="Meet your missing piece." fontSize={65} initialScale={1.35} color="#fafafa" fontFamily="Inter" mode="dark" />
    <Sequence from={74}><Caption>Zeke brings local .env files into new Git worktrees.</Caption></Sequence>
  </Shell>
);

// Illustrative playback matching Zeke's actual CLI output format.
// Filenames are examples; no environment values enter the video.
const lines: TerminalLine[] = [
  { text: "$ git worktree add ../feature -b feature", type: "command", delay: 8, pause: 20 },
  { text: 'zeke: copied ".env"', type: "log", delay: 8 },
  { text: 'zeke: copied "apps/api/.env.local"', type: "log", delay: 8 },
  { text: "zeke: 2 copied, 0 skipped.", type: "success", delay: 8, pause: 20 },
];

const Demo = () => (
  <Shell label="Enable once in your clone">
    <Sequence durationInFrames={100}>
      <TextBuild text="zeke install" fontSize={78} color={green} fontFamily="Inter" mode="dark" />
      <Caption>Set up once in the repository you use with T3 Code.</Caption>
    </Sequence>
    <Sequence from={100}>
      <TerminalSimulator intro={null} command={null} lines={lines} fontSize={10} charsPerFrame={1.6} chunkSize={3} zoom={{ enabled: true, scale: 0.95 }} mode="dark" />
      <div style={{ position: "absolute", top: 260, left: 80, fontSize: 45, fontWeight: 600, lineHeight: 1.3 }}>Local config.<br />Already there.</div>
    </Sequence>
    <div style={{ position: "absolute", bottom: 65, left: 56, color: muted, fontSize: 18 }}>Example project · missing, ignored files copy automatically</div>
  </Shell>
);

const Result = () => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [35, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return (
    <Shell label="Your T3 Code workflow, complete">
      <div style={{ position: "absolute", left: 110, top: 156, fontSize: 44, fontWeight: 600 }}>Your next T3 Code worktree, configured.</div>
      <div style={{ position: "absolute", left: 110, right: 110, top: 280, display: "flex", alignItems: "center", gap: 30 }}>
        {["main checkout", "T3 Code worktree"].map((branch, index) => (
          <React.Fragment key={branch}>
            {index === 1 && <div style={{ width: 120, height: 2, background: "#26272b", position: "relative" }}><div style={{ width: `${progress * 100}%`, height: 2, background: green }} /></div>}
            <div style={{ flex: 1, border: "1px solid #26272b", borderRadius: 12, padding: "25px 30px", background: "#141417" }}>
              <div style={{ fontSize: 21, color: muted, marginBottom: 20 }}>{branch} /</div>
              {[".env", "apps/api/.env.local"].map((file) => <div key={file} style={{ fontSize: 23, lineHeight: 1.9, fontFamily: "monospace", opacity: index === 0 ? 1 : progress }}><span style={{ color: green, marginRight: 12 }}>✓</span>{file}</div>)}
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ position: "absolute", left: 110, top: 552, color: muted, fontSize: 23 }}>Existing files stay intact. Nested paths stay intact.</div>
    </Shell>
  );
};

const End = () => (
  <Shell label="The missing piece for T3 Code worktrees">
    <div style={{ position: "absolute", top: 125, left: 0, right: 0, height: 240 }}><TextBuild text="More worktrees. Less setup." fontFamily="Inter" fontSize={67} mode="dark" /></div>
    <div style={{ position: "absolute", left: 250, right: 250, top: 390, padding: "25px 30px", border: "1px solid #26272b", borderRadius: 12, background: "#141417", fontFamily: "monospace", fontSize: 28 }}>
      <span style={{ color: green }}>$ </span>npm install -g @pruven/zeke
      <div style={{ marginTop: 17 }}><span style={{ color: green }}>$ </span>zeke install</div>
    </div>
    <div style={{ position: "absolute", top: 570, left: 0, right: 0, textAlign: "center", color: muted, fontSize: 20 }}>Run zeke install in your repository. Keep building in T3 Code.</div>
  </Shell>
);

const Video = () => (
  <SnapCnUIProvider mode="dark" theme={{ background: bg, primary: green, fontFamily: FONTS.Inter }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={120}><Hook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={120}><Intro /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={300}><Demo /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={150}><Result /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence durationInFrames={150}><End /></TransitionSeries.Sequence>
    </TransitionSeries>
  </SnapCnUIProvider>
);

export const Root = () => <Composition id="Zeke" component={Video} durationInFrames={durationInFrames} fps={30} width={1280} height={720} />;
