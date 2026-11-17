---
title: Development
description: Build, test, and release Zeke.
---

# Development

The source and integration tests are written in TypeScript. Install development dependencies and compile to JavaScript in `dist/`; the published CLI and installed hooks have no runtime dependencies.

```sh
bun install
npm test
npm run check
npm pack --dry-run
```

Run the integration suite with Bun using `bun run test:bun`, and package using `bun pm pack`. Both test scripts compile the TypeScript before running the suite. The same suite runs on both runtimes; Bun also runs an additional test that installs hooks and creates a worktree with Node absent from `PATH`.

The integration tests create disposable real Git repositories and worktrees, exercising automatic copying, existing hooks, stdin and exit status forwarding, config restoration, symlinks, ignore rules, dry runs, and operation without the original package.

## Documentation

The VitePress guide lives in [`docs/index.md`](index.md). Install development dependencies and start the docs server:

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
3. The workflow checks the package name and tag, runs TypeScript checks and the Node and Bun integration suites, inspects the package, then publishes to npm.

Stable versions publish under npm's `latest` tag. Versions such as `0.2.0-beta.1` publish under `next`; use a matching GitHub prerelease tag such as `v0.2.0-beta.1`. Each npm version can be published only once, so increment the version for every release. A locally published bootstrap version should not be published again by a GitHub release.

The publish job uses Node 24's npm for OIDC support, sets the package's repository metadata from the actual GitHub repository, and requests an identity token only in that job. npm automatically attaches provenance for OIDC publishes from public repositories. No GitHub repository URL is hardcoded.

References: [Git hooks](https://git-scm.com/docs/githooks), [core.hooksPath](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath), [Node glob matching](https://nodejs.org/api/path.html#pathmatchesglobpath-pattern).
