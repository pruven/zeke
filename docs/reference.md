---
title: Reference
description: Installation options, command details, configuration, and hook behavior.
---

# Reference

For the usual setup, follow [Getting started](index.md#getting-started). Use this page when you need alternate installation methods or details about a command.

## Installation options

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

Install Zeke globally and explicitly choose Bun for the CLI:

```sh
cd /path/to/your-project
bun add --global @pruven/zeke
bun "$(command -v zeke)" install
git worktree add ../my-feature -b my-feature
```

You can also run it directly, without installing the package:

```sh
bun /path/to/zeke/dist/bin/zeke.js install
```

Use `bun "$(command -v zeke)" sync`, `bun "$(command -v zeke)" status`, and the other commands the same way. For a local package, use `bun --bun zeke`. The explicit `--bun` matters because Bun otherwise respects the CLI's Node shebang. See [Bun's shebang documentation](https://bun.sh/guides/install/from-npm-install-to-bun-install#shebang).

For a global Bun install, invoke it with `bun "$(command -v zeke)" install` to select Bun explicitly. The shorter `bun --bun zeke` form resolves a project's local executable.

Hooks retain the runtime used by `init` or `install`: installing with Bun makes automatic worktree copying use Bun, with no Node dependency. `zeke status` shows the installed runtime and executable. To switch an existing installation to Bun, run `bun "$(command -v zeke)" install`; reinstall with Node to switch back.

Optionally run `zeke init` to create and commit `zeke.config.json` so teammates can share the rules, but keep the actual environment files ignored. Each developer runs `zeke install` once in their local clone to enable hooks and sync the current worktree. Hook installation is local to that clone and shared by its worktrees.

### Install from a checkout

From the Zeke source directory:

```sh
cd /path/to/zeke
npm install
npm install -g .

cd /path/to/your-project
zeke install
git worktree add ../my-feature -b my-feature
```

`zeke install` enables automatic copying and syncs the current worktree in one command. It stores its hook runtime in Git’s metadata directory without adding dependencies or creating a config file in your project. The new worktree receives your ignored environment files immediately, including nested files such as `apps/api/.env.local`. No dependency installation is needed inside the new worktree.

After building with `npm run build`, run the CLI directly without a global install:

```sh
node /path/to/zeke/dist/bin/zeke.js install
```

## Commands

| Command | Purpose |
| --- | --- |
| `zeke init` | Create config if missing, enable hooks, and sync this worktree |
| `zeke install` | Enable or refresh hooks and sync this worktree |
| `zeke sync` | Copy missing files into the current worktree, even without installing hooks |
| `zeke sync --verbose` | Show skipped paths and the reason for each skip |
| `zeke sync --all` | Copy missing files into all worktrees from the configured source |
| `zeke sync --dry-run` | Show what would be copied without writing files |
| `zeke status` | Show hook installation, runtime, project root, and config |
| `zeke doctor` | Diagnose setup problems and print specific repair instructions |
| `zeke diff` | Report missing files, differing files, and missing environment variable names |
| `zeke refresh --dry-run` | Preview updates to unedited Zeke copies |
| `zeke refresh` | Refresh unedited copies and back up each replaced file |
| `zeke uninstall` | Restore the previous hook configuration |
| `zeke --version` / `zeke -v` | Print the installed version (works outside Git repositories) |

Existing worktrees can use `zeke sync`. Ordinary branch switches do not trigger copying. `git worktree add --no-checkout` does not run the checkout hook; run `zeke sync` after checking out files.

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

Diff never writes files or directories. Configured exclusions, dependencies, and nested repositories are not scanned. Matching tracked or nonignored files, symlinks, and unsafe destination parents are reported as skipped paths; these skips cause exit code 1 even when no drift is found. Missing variable names are listed only for existing files; missing files are reported once by path. Extra destination files and extra variable names are not drift. Running in the source itself reports no drift.

The summary counts missing files, differing files, missing variable names, and skipped paths. Diff exits 0 when the comparison is complete with no drift, and 1 for drift, skipped paths, or errors. Use `zeke sync` to copy missing files; review existing differing files locally, since sync preserves their values. Run `zeke doctor` for setup errors. Both commands also work with your usual `npx zeke` or `bun --bun zeke` prefix.

## Safely refresh copied files

`sync` only fills missing files. To update an existing copy after the source changes, preview and then run an explicit refresh:

```sh
zeke refresh --dry-run
zeke refresh
```

After upgrading, run `zeke install` to refresh the installed hook runtime so future automatic copies are tracked. Existing copies remain untracked and are preserved.

Zeke now records a private content hash and permission bits whenever it copies a file, including automatic copies, `install`, and `sync --all`. Refresh compares the current destination against that baseline. It updates a file only when both its contents and permissions still match. Local edits, local permission changes, preexisting files, and copies made before tracking was available are preserved with a skip reason. Running sync again does not adopt an existing file or reset its baseline. Missing destinations are skipped with instructions to run `zeke sync`.

Refresh uses the current worktree, the configured source, and the same patterns, exclusions, Git ignore checks, and symlink restrictions as sync. It never deletes a destination when its source disappears. Unchanged files need no backup. Dry runs create no files, directories, tracking records, locks, or backups, and never advance a baseline. Output shows paths and counts, never environment values or hashes.

Before replacing a file, refresh saves and flushes its previous contents to a unique backup path, prints that path, prepares the replacement, and rechecks the destination for edits. A backup failure leaves the destination untouched. Successful updates preserve destination permission bits and advance the baseline so another refresh can safely update them later. Concurrent refresh commands for one worktree are blocked by a lock; an interrupted refresh may leave a lock with removal instructions on the next attempt.

Tracking and backups live under `<git-common-dir>/zeke-data/worktrees/<worktree-id>/`, with copy records in `files/` and backups in `backups/refresh-*/` using the original relative filenames. The data directories are private to your user. Backups contain actual secret file contents: keep them private and remove old backups manually when no longer needed. To restore one, copy the backup path printed by refresh over the destination; the restored content will count as a local edit until it matches the latest baseline again. Backups and copy records survive `zeke uninstall`; copied files and config also remain. Moving the repository changes worktree IDs, so refresh conservatively skips copies without records at the new location.

Refresh exits 0 when all selected files were refreshed or unchanged, and 1 when files were skipped or an error occurred. A run may update safe files while preserving other files with skip reasons. Files without a baseline are never refreshed automatically; if you deliberately want a fresh source copy, move your existing file to a safe backup location and use `zeke sync` to create a new tracked copy.

## Configuration

`zeke init` creates this file in the main worktree:

```json
{
  "source": "main-worktree",
  "copy": ["**/.env", "**/.env.*"],
  "exclude": ["**/.env.example"]
}
```

Zeke reads the main worktree's config on every sync, including automatic syncs. This gives all worktrees one predictable set of local rules. Changes take effect without reinstalling. Missing config uses these defaults.

Patterns use forward slashes and Node's `path.matchesGlob` syntax. `**/` includes files at the repository root. Custom `copy` or `exclude` arrays replace their defaults. To copy an additional ignored local file:

```json
{
  "copy": ["**/.env", "**/.env.*", "config/local.json"],
  "exclude": ["**/.env.example", "**/.env.production"]
}
```

`source` can also be an absolute path or a path relative to the main worktree, such as `../dev-config-worktree`. It must point to the root of another worktree belonging to the same repository. With a bare repository, the first non-bare worktree is used as the main worktree.

### Copy behavior

Only files ignored by Git in **both** the source and destination are copied. Tracked files and untracked files that are not ignored are skipped. This prevents a branch with different ignore rules from accidentally exposing copied secrets to `git add`.

Zeke skips symbolic links, nested Git repositories/submodules, and directories named `.git`, `node_modules`, `.next`, `.cache`, `dist`, `build`, `.venv`, `vendor`, or `coverage`. It does not follow destination symlink directories. An existing destination file or symlink is left alone. Files are independent copies, so editing one worktree's config does not change another's. Zeke copies file contents and permission bits, not ownership or other metadata; it prints filenames and counts, never values.

## How it works

1. `install` (or `init`) locates Git's shared metadata directory with `git rev-parse --git-common-dir`.
2. It saves the prior `core.hooksPath` setting and installs a small runtime under `<git-common-dir>/zeke/`.
3. It points the repository's `core.hooksPath` at Zeke's generated hook directory.
4. It syncs missing ignored files into the current worktree immediately.
5. Hook dispatchers run the previous hooks with their arguments, stdin, working directory, environment, and exit status preserved.
6. On an initial `post-checkout` event, identified by a zero old HEAD and the branch-checkout flag, Zeke finds matching ignored source files and copies missing ones using exclusive file creation.

The installed runtime is copied into Git's metadata directory. It does not depend on the original package remaining installed or on `node_modules` existing in the new worktree. It records the Node or Bun executable used at installation; reinstall hooks with your chosen runtime after moving or removing that runtime installation.

The hook copies after the previous `post-checkout` hook runs. An automatic copy error prints a message with instructions to retry using `zeke sync`; it does not turn successful Git worktree creation into a failure. An existing hook's failure remains a failure. Manual sync errors return a nonzero exit code.

## Existing hook tools

Zeke forwards Git's documented hooks to the previous hook directory rather than editing its scripts. Relative paths such as `.husky/_` resolve from the directory where Git runs the hook, allowing hooks present in each checkout to keep working. Absolute and default `.git/hooks` directories are supported too. Existing hook scripts are never modified.

Install Zeke **after** other hook managers have completed setup. If a later tool changes `core.hooksPath`, `zeke status` reports it as inactive. To uninstall cleanly, restore `core.hooksPath` to the Zeke path shown by the original installation (`<git-common-dir>/zeke/hooks`), then run `zeke uninstall`. Zeke refuses to replace a changed setting automatically. Worktree-scoped or command-scoped hook path overrides must be removed before installation; overrides in other worktrees can also bypass the shared hook setting.

`zeke uninstall` restores the previous local setting, or removes Zeke's local override to reveal inherited settings. It removes its installed runtime while keeping copied files and `zeke.config.json`. Moving a repository changes the absolute runtime location; uninstall before moving it and install again afterward.


For building, testing, or releasing Zeke, see [Development](development.md).
