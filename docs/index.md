# Zeke

Your local environment files, automatically available in every new Git worktree.

Zeke installs a Git `post-checkout` hook that copies missing, ignored `.env` and `.env.*` files from your main checkout into new worktrees. It preserves directory structure, excludes `.env.example`, and never overwrites existing files.

## Getting started

You need Git 2.36 or newer and either Node.js 22.20+ or Bun 1.4.4+. Zeke supports Linux and macOS; Windows / Git Bash has not been tested.

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
| `zeke sync --dry-run` | Preview copies without writing files |
| `zeke status` | Show hook installation, runtime, project root, and config |
| `zeke uninstall` | Restore the previous hook configuration |
| `zeke --version` | Print the installed version |

Use `zeke sync` for existing worktrees or after `git worktree add --no-checkout` and a later checkout. Ordinary branch switches do not trigger copying.

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
