---
title: Guide
description: Set up Zeke to copy local environment files into new Git worktrees. Installation, commands, configuration, and copy behavior.
---

<DocsIntro />

## Getting started

You need Git 2.36 or newer and either Node.js 22.20+ or Bun 1.4.4+. Zeke supports Linux and macOS; Windows / Git Bash has not been tested.

Zeke installs a Git `post-checkout` hook that copies missing, ignored `.env` and `.env.*` files from your main checkout. It excludes `.env.example` and never overwrites existing files.

Install Zeke globally, then enable it in your project:

```sh
npm install -g @pruven/zeke
cd /path/to/your-project
zeke install
git worktree add ../my-feature -b my-feature
```

`zeke install` enables automatic copying and syncs the current worktree in one command. It stores its hook runtime in Git’s metadata directory without adding dependencies or creating a config file in your project. The new worktree receives your ignored environment files immediately, including nested files such as `apps/api/.env.local`. No dependency installation is needed in the new worktree.

### Project-level setup

Install Zeke as a development dependency to keep its version with your project. No global installation is required.

With npm:

```sh
cd /path/to/your-project
npm install --save-dev @pruven/zeke
npx zeke install
git worktree add ../my-feature -b my-feature
```

With Bun:

```sh
cd /path/to/your-project
bun add --dev @pruven/zeke
bun --bun zeke install
git worktree add ../my-feature -b my-feature
```

Commit `package.json` and your lockfile so teammates use the same version. After installing dependencies, each developer runs `npx zeke install` or `bun --bun zeke install` once in their clone. Run this after any other hook managers finish setup.

Use the same local command prefix for other commands, such as `npx zeke status`, `npx zeke sync`, or `bun --bun zeke status`. To create a shared `zeke.config.json`, run `npx zeke init` or `bun --bun zeke init` and commit the config while keeping environment files ignored.

The installed hook runtime lives in Git's shared metadata directory, so automatic copying works in new worktrees before their dependencies are installed. After updating the Zeke dependency, run the install command again to refresh that runtime.

### Using Bun globally

```sh
bun add --global @pruven/zeke
bun "$(command -v zeke)" install
git worktree add ../my-feature -b my-feature
```

Use `bun "$(command -v zeke)"` for subsequent commands too (or `bun --bun zeke` with a local package). Hooks retain the runtime used during installation, so initializing with Bun makes automatic copying use Bun.

Optionally run `zeke init` to create and commit `zeke.config.json` to share rules with teammates, and keep environment files ignored. Each developer runs `zeke install` for Node or `bun "$(command -v zeke)" install` for Bun once in their own clone.

## Commands

| Command | Purpose |
| --- | --- |
| `zeke init` | Create config if missing, enable hooks, and sync this worktree |
| `zeke install` | Enable or refresh hooks and sync this worktree |
| `zeke sync` | Copy missing files into the current worktree |
| `zeke sync --verbose` | Show skipped paths and the reason for each skip |
| `zeke sync --all` | Copy missing files into all worktrees from the configured source |
| `zeke sync --dry-run` | Preview copies without writing files |
| `zeke status` | Show hook installation, runtime, project root, and config |
| `zeke doctor` | Diagnose setup problems and print specific repair instructions |
| `zeke diff` | Report missing files, differing files, and missing environment variable names |
| `zeke uninstall` | Restore the previous hook configuration |
| `zeke --version` | Print the installed version |

Use `zeke sync` for existing worktrees or after `git worktree add --no-checkout` and a later checkout. Ordinary branch switches do not trigger copying.

### Sync details and all worktrees

Use `--verbose` to explain skipped paths, including existing destination files,
excluded files, source symlinks, unsafe destination parents, and files tracked or
not ignored by Git in either worktree. Dependency/build directories and nested
repositories are not scanned. Output includes paths and reasons, never file contents.

```sh
zeke sync --verbose
zeke sync --all --dry-run --verbose
zeke sync --all
```

`--all` uses the same configured source and the main worktree's config for every
destination, including the main worktree when another worktree is the source.
It skips the source itself, bare repositories, and missing worktree directories.
Each destination keeps its existing files and must ignore a file before receiving
it. Output groups results by worktree and ends with a total. If one destination
fails, Zeke continues with the others and exits with a nonzero status. Dry runs
create neither files nor directories.

## Diagnose setup and environment drift

Run `zeke doctor` inside a worktree to check installation state, the saved Node/Bun executable, installed runtime files, generated hook dispatchers, effective `core.hooksPath`, the main worktree's config, and source availability. It reports hook-manager conflicts and worktree or command-scoped overrides, with repair instructions for each problem. It checks the current worktree's effective hook settings; run it in another worktree to diagnose that worktree's overrides. It never changes hooks, config, or environment files. A healthy installation exits 0; detected problems exit 1.

```sh
zeke doctor
zeke diff
```

`zeke diff` compares the current worktree with the configured source, using the main worktree's config and the same file selection and Git ignore rules as sync. It reports missing destination files and byte differences in existing files. For differing `.env` and `.env.*` files, it also lists variable names present in the source but missing from the destination. Empty assignments count as present; quoted multiline values and `export` assignments are supported. Only standard variable names (`A–Z`, `a–z`, digits, and underscores, starting with a letter or underscore) are listed. Custom files such as JSON are compared as bytes. It prints no values, contents, or content hashes.

Diff never writes files or directories. It excludes tracked and nonignored files, configured exclusions, dependencies, and nested repositories. Symlinks and unsafe destination parents are skipped with reasons. Missing variable names are listed only for existing files; missing files are reported once by path. Extra destination files and extra variable names are not drift. Running in the source itself reports no drift.

The summary counts missing files, differing files, missing variable names, and skipped paths. Diff exits 0 when the comparison is complete with no drift, and 1 for drift, skipped paths, or errors. Use `zeke sync` to copy missing files; review existing differing files locally, since sync preserves their values. Run `zeke doctor` for setup errors. Both commands also work with your usual `npx zeke` or `bun --bun zeke` prefix.

## Configuration

`zeke init` creates `zeke.config.json` in your main worktree:

```json
{
  "source": "main-worktree",
  "copy": ["**/.env", "**/.env.*"],
  "exclude": ["**/.env.example"]
}
```

Zeke reads this config on every sync, so changes take effect without reinstalling. Missing config uses these defaults. Patterns use forward slashes and Node's `path.matchesGlob` syntax; `**/` also matches files at the repository root.

Custom `copy` and `exclude` arrays replace their defaults. For example, include an additional ignored local file while excluding production environment files:

```json
{
  "copy": ["**/.env", "**/.env.*", "config/local.json"],
  "exclude": ["**/.env.example", "**/.env.production"]
}
```

`source` can also point to another worktree in the same repository, using an absolute path or a path relative to the main worktree.

## Copy behavior

- Files must be ignored by Git in both the source and destination. Tracked files and untracked files that are not ignored are skipped.
- Existing destination files and symlinks are left alone. Zeke skips source symlinks, destination symlink directories, nested repositories, and common dependency and build directories.
- Files are independent copies. Editing an environment file in one worktree does not change another's.
- Zeke prints filenames and counts, never file contents.

## Existing hooks

Zeke forwards Git hooks to your previous hook directory without editing its scripts. Install Zeke after other hook managers have completed setup.

If another tool later changes `core.hooksPath`, `zeke status` reports Zeke as inactive. Zeke refuses to replace a changed setting automatically. From inside your repository, restore Zeke's hook path (`<git-common-dir>/zeke/hooks`) before uninstalling:

```sh
git config --local --replace-all core.hooksPath "$(git rev-parse --path-format=absolute --git-common-dir)/zeke/hooks"
zeke uninstall
```

For Bun, use `bun --bun zeke status` and `bun --bun zeke uninstall`.

Uninstalling restores the previous hook configuration and removes Zeke's installed runtime. Copied files and `zeke.config.json` remain in place.
