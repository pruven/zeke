# Zeke

Your local environment files, automatically available in every new Git worktree.

Zeke copies missing, ignored `.env` and `.env.*` files from your main checkout into new worktrees. It includes nested files, excludes `.env.example`, and leaves existing files untouched.

## Get started

Requires Git 2.36+ and either Node.js 22.20+ or Bun 1.4.4+, on Linux or macOS. Windows / Git Bash has not been tested.

```sh
npm install -g @pruven/zeke
cd /path/to/your-project
zeke install
```

Now create a worktree as usual:

```sh
git worktree add ../my-feature -b my-feature
```

Your environment files are already there. No config file or dependency install in the new worktree is needed.

Using Bun or installing for a team? See [installation options](docs/reference.md#installation-options).

## Everyday commands

| When you want to… | Run |
| --- | --- |
| Copy missing files into an existing worktree | `zeke sync` |
| Check your setup | `zeke status` |
| Get setup repair instructions | `zeke doctor` |
| See which files or variable names differ | `zeke diff` |
| Remove Zeke’s hooks | `zeke uninstall` |

`sync` only copies missing files. To update files Zeke previously copied, see [refresh](docs/reference.md#safely-refresh-copied-files). It preserves local edits and backs up replaced files.

## Good to know

- Files must be ignored by Git in both worktrees.
- Copies are independent: editing one does not change another.
- Install Zeke after other hook managers. Run `zeke doctor` if copying stops working.
- Run `zeke install` again after upgrading Zeke to update the installed hooks.
- Uninstalling restores the previous hooks and keeps your copied files.

## More

- [Guide](docs/index.md#getting-started) — setup and everyday use.
- [Reference](docs/reference.md) — all commands, configuration, Bun, team setup, and hook details.
- [Development](docs/development.md) — building, testing, docs, and publishing.
