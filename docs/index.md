---
title: Guide
description: Install Zeke and copy your local environment files into new Git worktrees.
---

<DocsIntro />

## Getting started

You need Git 2.36+ and either Node.js 22.20+ or Bun 1.4.4+, on Linux or macOS. Windows / Git Bash has not been tested.

Install Zeke, then enable it in your project:

```sh
npm install -g @pruven/zeke
cd /path/to/your-project
zeke install
```

Create a worktree as usual:

```sh
git worktree add ../my-feature -b my-feature
```

Your new worktree gets the main checkout’s ignored `.env` and `.env.*` files, including nested files like `apps/api/.env.local`. `.env.example` is excluded. Existing files stay untouched.

That’s it. No config file or dependency install in the new worktree is needed.

### Project-level setup

To keep Zeke’s version with your project, install it as a dev dependency. Run these commands in your project directory:

```sh
npm install --save-dev @pruven/zeke
npx zeke install
```

Or with Bun:

```sh
bun add --dev @pruven/zeke
bun --bun zeke install
```

Commit `package.json` and your lockfile. Each developer runs the install command once in their clone, after other hook managers finish setup, and again after upgrading Zeke.

Use `npx zeke` or `bun --bun zeke` for the commands below. New worktrees receive environment files before their dependencies are installed.

For global Bun installs and more details, see [installation options](reference.md#installation-options).

## Commands

| When you want to… | Run |
| --- | --- |
| Copy missing files into an existing worktree | `zeke sync` |
| Check your setup | `zeke status` |
| Get setup repair instructions | `zeke doctor` |
| See which files or variable names differ | `zeke diff` |
| Remove Zeke’s hooks | `zeke uninstall` |

`sync` only copies missing files. To update files Zeke previously copied, use [refresh](reference.md#safely-refresh-copied-files), which preserves local edits and backs up replaced files.

See the [full command reference](reference.md#commands) for previews, syncing all worktrees, and other options.

## Configuration

The defaults work without a config file. To choose different files, run:

```sh
zeke init
```

This creates `zeke.config.json` in your main worktree:

```json
{
  "source": "main-worktree",
  "copy": ["**/.env", "**/.env.*"],
  "exclude": ["**/.env.example"]
}
```

Commit the config to share rules with your team; keep the environment files ignored. Each developer runs `zeke install` once in their clone.

See [configuration details](reference.md#configuration) to add other files or use a different source worktree.

## Copy behavior

- Files must be ignored by Git in both worktrees.
- Existing files are never overwritten by install or sync.
- Each worktree gets its own copy; edits do not carry across worktrees.
- Zeke skips symlinks, nested repositories, and common dependency and build folders.
- Output shows paths and counts, never environment values.

Install Zeke after other hook managers. If copying stops working, run `zeke doctor` for repair instructions. See [existing hooks](reference.md#existing-hook-tools) for details.
