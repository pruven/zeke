import React from "react";
import { AbsoluteFill, Composition, Easing, interpolate, Series, useCurrentFrame } from "remotion";
import { TextReveal } from "./components/snap-cn/text-reveal";
import { FONTS, SnapCnUIProvider } from "./lib/snap-cn-ui";

const paper = "#eeeae1";
const ink = "#191c19";
const lime = "#d5f660";
const gray = "#90978b";
const mono = '"DejaVu Sans Mono", monospace';
export const durationInFrames = 660;

const move = (frame: number, start: number, end: number) => interpolate(frame, [start, end], [0, 1], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.25, 0.1, 0.25, 1),
});

const Frame: React.FC<{ children: React.ReactNode; dark?: boolean; accent?: boolean; chapter: string; index: string }> = ({ children, dark, accent, chapter, index }) => (
  <AbsoluteFill style={{ background: accent ? lime : dark ? ink : paper, color: dark ? paper : ink, fontFamily: FONTS["Space Grotesk"], overflow: "hidden", textRendering: "geometricPrecision" }}>
    <div style={{ position: "absolute", inset: "32px 48px auto", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 4 }}>
      <span style={{ fontSize: 30, fontWeight: 700 }}>zeke<span style={{ color: dark ? lime : ink }}>.</span></span>
      <span style={{ fontFamily: mono, fontSize: 15 }}>{chapter}</span>
    </div>
    {children}
    <div style={{ position: "absolute", bottom: 30, left: 48, right: 48, borderTop: `1px solid ${dark ? "#41473b" : "#b8bcaa"}`, paddingTop: 14, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 14 }}>
      <span>Local environment. Every worktree.</span><span>{index} / 05</span>
    </div>
  </AbsoluteFill>
);

const FileGlyph: React.FC<{ missing?: boolean; size?: number }> = ({ missing, size = 130 }) => (
  <svg width={size} height={size * 1.22} viewBox="0 0 130 158" fill="none">
    <path d="M8 4H83L122 43V150H8V4Z" stroke="currentColor" strokeWidth="3" strokeDasharray={missing ? "9 8" : undefined} />
    <path d="M83 4V43H122" stroke="currentColor" strokeWidth="3" />
    <text x="24" y="108" fill="currentColor" fontSize="30" fontFamily={mono}>{missing ? "?" : ".env"}</text>
  </svg>
);

const Hook = () => {
  const f = useCurrentFrame();
  const p = move(f, 8, 30);
  return <Frame chapter="A familiar interruption" index="01">
    <div style={{ position: "absolute", left: 48, top: 145, fontSize: 98, fontWeight: 600, lineHeight: 1.02 }}>New worktree.<br /><span style={{ fontFamily: FONTS["Instrument Serif"], fontWeight: 400 }}>Same missing</span></div>
    <div style={{ position: "absolute", left: 48, top: 362, fontSize: 118, lineHeight: 1, fontFamily: mono, transform: `translateY(${(1 - p) * 65}px)`, opacity: p }}>.env<span style={{ fontFamily: FONTS["Space Grotesk"] }}>?</span></div>
    <div style={{ position: "absolute", right: 88, top: 212, color: "#717866", transform: `rotate(${interpolate(f, [0, 35], [-9, -3], { extrapolateRight: "clamp" })}deg)` }}><FileGlyph missing size={208} /></div>
    <div style={{ position: "absolute", left: 52, top: 559, fontSize: 23 }}>Your code made it. Your local config didn’t.</div>
  </Frame>;
};

const Intro = () => <Frame accent chapter="The missing piece for T3 Code" index="02">
  <TextReveal text="Meet zeke." fontFamily="Space Grotesk" fontSize={160} fontWeight={600} color={ink} initialScale={1.5} pushScale={1.02} mode="light" theme={{ background: lime }} />
  <div style={{ position: "absolute", top: 522, left: 0, right: 0, textAlign: "center", fontSize: 27 }}>Your .env files. Automatically along for the ride.</div>
</Frame>;

// A fixed terminal window needs independent command/output timing rather than
// the registry terminal's full-canvas camera. All output uses the real CLI copy.
const Demo = () => {
  const frame = useCurrentFrame();
  const worktree = frame >= 65;
  const localFrame = worktree ? frame - 65 : frame;
  const command = worktree ? "git worktree add ../feat -b feat" : "zeke install";
  const count = Math.max(0, Math.floor((localFrame - 6) * (worktree ? 1.4 : 0.8)));
  const typed = command.slice(0, count);
  const complete = count >= command.length;
  const blink = Math.floor(frame / 14) % 2 === 0;
  const outputAt = worktree ? 36 : 27;
  return <Frame dark chapter="Enable once. Keep building." index="03">
    <div style={{ position: "absolute", left: 94, top: 112, fontSize: 42 }}>One install. Then just Git.</div>
    <div style={{ position: "absolute", left: 94, right: 94, top: 189, height: 390, background: "#10130f", border: "1px solid #485042", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ height: 54, padding: "0 24px", background: "#272c24", borderBottom: "1px solid #3b4335", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: mono, fontSize: 15 }}>
        <div style={{ display: "flex", gap: 8, width: 130 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "#77806e" }} />)}</div>
        <span style={{ color: "#d2d6c9" }}>your-project — zsh</span>
        <span style={{ color: "#a8b09e", textAlign: "right", width: 130 }}>⑂ main</span>
      </div>
      <div style={{ padding: "30px 34px", fontFamily: mono }}>
        <div style={{ fontSize: 29, height: 44, lineHeight: "44px", display: "flex", alignItems: "center", whiteSpace: "pre" }}>
          <span style={{ color: lime, marginRight: 19 }}>❯</span><span style={{ color: paper }}>{typed}</span>
          {(!complete || localFrame < outputAt) && blink && <span style={{ display: "inline-block", width: 14, height: 29, background: lime, marginLeft: 4 }} />}
        </div>
        {!worktree && localFrame >= outputAt && <div style={{ marginTop: 20, fontSize: 23, lineHeight: 1.65, color: "#c4ccba" }}>
          <div><span style={{ color: lime }}>zeke: enabled.</span></div>
          <div>New worktrees will receive missing local environment files.</div>
        </div>}
        {worktree && <div style={{ marginTop: 18, fontSize: 23, lineHeight: "40px" }}>
          {[['zeke: copied ', '".env"'], ['zeke: copied ', '"apps/api/.env.local"']].map(([prefix, name], i) => <div key={name} style={{ visibility: localFrame >= outputAt + i * 8 ? "visible" : "hidden" }}><span style={{ color: "#a3ad98" }}>{prefix}</span><span style={{ color: paper }}>{name}</span></div>)}
          <div style={{ color: lime, visibility: localFrame >= 57 ? "visible" : "hidden" }}>zeke: 2 copied, 0 skipped.</div>
        </div>}
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 35, borderTop: "1px solid #30372a", padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#a3ad98", fontFamily: mono, fontSize: 13 }}>
        <span>~/your-project</span><span style={{ color: localFrame >= (worktree ? 57 : outputAt) ? lime : "#a3ad98" }}>{localFrame >= (worktree ? 57 : outputAt) ? worktree ? "Worktree ready" : "Hook enabled" : "Running"}</span>
      </div>
    </div>
    <div style={{ position: "absolute", left: 94, right: 94, top: 607, display: "flex", justifyContent: "space-between", fontSize: 19 }}>
      <span style={{ color: paper }}>{worktree ? "Create a worktree. Your local files follow." : "Enable Zeke once in your repository."}</span>
      <span style={{ color: gray, fontFamily: mono, fontSize: 15 }}>{worktree ? "02 / Create" : "01 / Enable"}</span>
    </div>
  </Frame>;
};

const FileRow: React.FC<{ name: string; progress?: number }> = ({ name, progress = 1 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 0", borderTop: "1px solid #b9bfa9", fontFamily: mono, fontSize: 22, opacity: progress, transform: `translateX(${(1 - progress) * -28}px)` }}>
    <span style={{ background: ink, color: lime, width: 27, height: 27, fontSize: 19, textAlign: "center" }}>✓</span>{name}
  </div>
);

const Result = () => {
  const f = useCurrentFrame();
  const route = move(f, 16, 51);
  const first = move(f, 48, 65);
  const second = move(f, 65, 82);
  return <Frame chapter="The files follow you" index="04">
    <div style={{ position: "absolute", left: 48, top: 108, fontSize: 65, fontWeight: 500 }}>Already there.</div>
    <div style={{ position: "absolute", right: 49, top: 129, fontSize: 21, width: 305, lineHeight: 1.4 }}>Same paths. Independent copies.<br />Existing files stay intact.</div>
    <svg style={{ position: "absolute", inset: 0 }} width="1280" height="720" fill="none">
      <path d="M508 390H772" stroke="#b3b9a5" strokeWidth="2" />
      <path d="M508 390H772" stroke={ink} strokeWidth="3" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - route} />
      <path d="M757 379L772 390L757 401" stroke={ink} strokeWidth="3" opacity={route} />
      {[0, 1].map(i => <rect key={i} x={518 + move(f, 18 + i * 12, 49 + i * 12) * 235} y="381" width="17" height="17" fill={ink} opacity={f > 49 + i * 12 ? 0 : route} />)}
    </svg>
    {[false, true].map((target) => <div key={String(target)} style={{ position: "absolute", left: target ? 780 : 48, top: 258, width: 452, height: 272, background: target ? lime : "#e4e2d7", padding: "24px 26px", boxSizing: "border-box", border: `1px solid ${target ? ink : "#b3b9a5"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 26 }}><span style={{ fontSize: 29, fontWeight: 500 }}>{target ? "New worktree" : "Main checkout"}</span><span style={{ fontSize: 14, fontFamily: mono }}>{target ? "feat ↗" : "main"}</span></div>
      <FileRow name=".env" progress={target ? first : 1} /><FileRow name="apps/api/.env.local" progress={target ? second : 1} />
    </div>)}
    <div style={{ position: "absolute", left: 48, top: 575, fontSize: 25, opacity: move(f, 89, 103) }}>From “where’s my config?” to ready to build.</div>
  </Frame>;
};

const End = () => <Frame dark chapter="The missing piece for T3 Code worktrees" index="05">
  <div style={{ position: "absolute", top: 125, left: 0, right: 0, height: 120 }}><TextReveal text="More worktrees." fontFamily="Space Grotesk" fontSize={96} fontWeight={500} initialScale={1.1} pushScale={1} color={paper} mode="dark" /></div>
  <div style={{ position: "absolute", top: 250, left: 0, right: 0, textAlign: "center", fontFamily: FONTS["Instrument Serif"], fontSize: 110, color: lime }}>Less setup.</div>
  <div style={{ position: "absolute", left: 194, right: 194, top: 437, padding: "24px 30px", background: lime, color: ink, fontFamily: mono, fontSize: 27, lineHeight: 1.8 }}>
    <div><span style={{ opacity: 0.5 }}>$ </span>npm install -g @pruven/zeke</div>
    <div><span style={{ opacity: 0.5 }}>$ </span>zeke install</div>
  </div>
</Frame>;

const Video = () => <SnapCnUIProvider mode="dark" theme={{ background: ink, primary: lime, fontFamily: FONTS["Space Grotesk"] }}>
  <Series>
    <Series.Sequence durationInFrames={96}><Hook /></Series.Sequence>
    <Series.Sequence durationInFrames={90}><Intro /></Series.Sequence>
    <Series.Sequence durationInFrames={180}><Demo /></Series.Sequence>
    <Series.Sequence durationInFrames={156}><Result /></Series.Sequence>
    <Series.Sequence durationInFrames={138}><End /></Series.Sequence>
  </Series>
</SnapCnUIProvider>;

export const Root = () => <Composition id="Zeke" component={Video} durationInFrames={durationInFrames} fps={30} width={1280} height={720} />;
