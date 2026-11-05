# Zeke

Your local environment files, automatically available in every new Git worktree.

Zeke installs a `post-checkout` hook that copies missing, ignored `.env` and `.env.*` files from your main checkout into new worktrees. It excludes `.env.example`, preserves directory structure, and never overwrites existing files.

## Requirements

- Node.js 22.20+ **or** Bun 1.4.4+, available when Git runs hooks. You only need one runtime.
- Git with worktree support.
- Linux or macOS. Windows / Git Bash has not been tested.

## Install from this checkout

Install from npm with `npm install -g @pruven/zeke`. To install this checkout locally:

```sh
cd /path/to/zeke
npm install -g .

cd /path/to/your-project
zeke install
git worktree add ../my-feature -b my-feature
```

`zeke install` enables automatic copying and syncs the current worktree in one command. It stores its hook runtime in Git’s metadata directory without adding dependencies or creating a config file in your project. The new worktree receives your ignored environment files immediately, including nested files such as `apps/api/.env.local`. No dependency installation is needed inside the new worktree.

Alternatively, run the CLI directly without a global install:

```sh
node /path/to/zeke/bin/zeke.js install
```

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
bun /path/to/zeke/bin/zeke.js install
```

Use `bun "$(command -v zeke)" sync`, `bun "$(command -v zeke)" status`, and the other commands the same way. For a local package, use `bun --bun zeke`. The explicit `--bun` matters because Bun otherwise respects the CLI's Node shebang. See [Bun's shebang documentation](https://bun.sh/guides/install/from-npm-install-to-bun-install#shebang).

For a global Bun install, invoke it with `bun "$(command -v zeke)" install` to select Bun explicitly. The shorter `bun --bun zeke` form resolves a project's local executable.

Hooks retain the runtime used by `init` or `install`: installing with Bun makes automatic worktree copying use Bun, with no Node dependency. `zeke status` shows the installed runtime and executable. To switch an existing installation to Bun, run `bun "$(command -v zeke)" install`; reinstall with Node to switch back.

Optionally run `zeke init` to create and commit `zeke.config.json` so teammates can share the rules, but keep the actual environment files ignored. Each developer runs `zeke install` once in their local clone to enable hooks and sync the current worktree. Hook installation is local to that clone and shared by its worktrees.

## Commands

| Command | Purpose |
| --- | --- |
| `zeke init` | Create config if missing, enable hooks, and sync this worktree |
| `zeke install` | Enable or refresh hooks and sync this worktree |
| `zeke sync` | Copy missing files into the current worktree, even without installing hooks |
| `zeke sync --dry-run` | Show what would be copied without writing files |
| `zeke status` | Show hook installation, runtime, project root, and config |
| `zeke uninstall` | Restore the previous hook configuration |
| `zeke --version` / `zeke -v` | Print the installed version (works outside Git repositories) |

Existing worktrees can use `zeke sync`. Ordinary branch switches do not trigger copying. `git worktree add --no-checkout` does not run the checkout hook; run `zeke sync` after checking out files.

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

## Development

No build step or runtime dependencies are required.

```sh
npm test
npm run check
npm pack --dry-run
```

Run the integration suite with Bun using `bun run test:bun` (or `bun test`), and package using `bun pm pack`. The same suite runs on both runtimes; Bun also runs an additional test that installs hooks and creates a worktree with Node absent from `PATH`.

The integration tests create disposable real Git repositories and worktrees, exercising automatic copying, existing hooks, stdin and exit status forwarding, config restoration, symlinks, ignore rules, dry runs, and operation without the original package.

### Documentation

The VitePress guide lives in [`docs/index.md`](docs/index.md). Install development dependencies and start the docs server:

```sh
bun install
bun run docs:dev
```

Use `bun run docs:build` to generate the static site in `docs/.vitepress/dist`, and `bun run docs:preview` to preview that build locally.

## Publishing to npm

`.github/workflows/publish.yml` publishes the public package `@pruven/zeke` when a GitHub release is **published**. Draft releases do not publish. The CLI command remains `zeke`.

### One-time authentication setup

For an existing npm package, open its npm settings and add a **GitHub Actions trusted publisher** with your GitHub owner, repository, and workflow filename `publish.yml` (not its full path). Leave the environment field empty and allow direct `npm publish`. The workflow uses GitHub OIDC; no npm secret is needed once this is configured. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

`@pruven/zeke` already exists on npm. The workflow uses OIDC exclusively, so an `NPM_TOKEN` secret is not used. You must have publishing access to the `@pruven` npm scope to configure its trusted publisher. Ensure **Allow npm publish** is enabled; the default permission for `npm stage publish` alone is insufficient. The first successful OIDC publish validates a new trusted publisher; it must happen within two days of creating the configuration. Expired configurations must be deleted and recreated.

### Release a version

1. Set the desired version in `package.json` and commit/push the changes with the workflow.
2. Create and publish a GitHub release whose tag is exactly `v` followed by that version, such as `v0.1.0`.
3. The workflow checks the package name and tag, runs syntax checks and the Node and Bun integration suites, inspects the package, then publishes to npm.

Stable versions publish under npm's `latest` tag. Versions such as `0.2.0-beta.1` publish under `next`; use a matching GitHub prerelease tag such as `v0.2.0-beta.1`. Each npm version can be published only once, so increment the version for every release. A locally published bootstrap version should not be published again by a GitHub release.

The publish job uses Node 24's npm for OIDC support, sets the package's repository metadata from the actual GitHub repository, and requests an identity token only in that job. npm automatically attaches provenance for OIDC publishes from public repositories. No GitHub repository URL is hardcoded.

References: [Git hooks](https://git-scm.com/docs/githooks), [core.hooksPath](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath), [Node glob matching](https://nodejs.org/api/path.html#pathmatchesglobpath-pattern).
