# Zeke video

A 22-second, 1280×720, 30fps product film built with Remotion and SnapCN’s `text-reveal` component and a fixed terminal window with separate setup and worktree playback. Warm paper, charcoal, and lime frames pair oversized Space Grotesk headlines with Instrument Serif accents and a moving file-transfer diagram. Scenes use hard cuts, with a stable install card at the end.

From the repository root, install video dependencies once with `bun install --cwd video`, then run `bun run video:studio` or `bun run video:render`.

Validate with `bun run video:check` and `bun run video:test`. CI runs both against the standalone video package. Browser regression tests use Remotion's Chrome Headless Shell; download it ahead of the tests with `bun run --bun --cwd video remotion browser ensure`.

```sh
cd video
bun install
bun run studio
bun run check
bun run render
```

The rendered video is `out/zeke.mp4`. The composition is in `src/Root.tsx`; the installed SnapCN components remain editable in `src/components/snap-cn/`.

The story positions Zeke as the missing piece for developers using Git worktrees in T3 Code: a fresh worktree is missing its local environment, Zeke fills that gap, and files arrive automatically after a one-time repository setup. The ending pairs “More worktrees. Less setup.” with the install commands. Terminal playback is an illustrative example using the project's real CLI output format and example filenames. It does not read environment values or install Git hooks. The video is silent and ends on a held install card.

SnapCN components were installed with:

```sh
bunx shadcn@latest add @snapcn/text-reveal @snapcn/text-build @snapcn/terminal-simulator -y
```

Rendered proof frames are saved alongside the MP4 in `out/`.
