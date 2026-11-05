import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export interface Config {
  source: string;
  copy: string[];
  exclude: string[];
}

interface Context {
  root: string;
  common: string;
  directory: string;
  hooks: string;
}

interface RuntimeInfo {
  name: 'node' | 'bun';
  version: string;
  executable: string;
}

export interface InstallationState {
  version: number;
  projectRoot: string;
  previousLocal: string[];
  previousEffective: string | null;
  common: string;
  runtime?: RuntimeInfo;
}

interface GitOptions {
  optional?: boolean;
  input?: string;
}

const CONFIG = 'zeke.config.json';
export const defaults: Config = {
  source: 'main-worktree',
  copy: ['**/.env', '**/.env.*'],
  exclude: ['**/.env.example'],
};
const pruned = new Set(['.git', 'node_modules', '.next', '.cache', 'dist', 'build', '.venv', 'vendor', 'coverage']);
const hookNames = `applypatch-msg pre-applypatch post-applypatch pre-commit pre-merge-commit prepare-commit-msg commit-msg post-commit pre-rebase post-checkout post-merge pre-push pre-receive update proc-receive post-receive post-update reference-transaction push-to-checkout pre-auto-gc post-rewrite sendemail-validate fsmonitor-watchman p4-changelist p4-prepare-changelist p4-post-changelist p4-pre-submit post-index-change`.split(' ');

// Hook environments contain repository-specific variables. Clear these for Git
// commands aimed at the source checkout, while preserving the user's identity/PATH.
export function git(args: string[], cwd?: string, options?: GitOptions & { optional?: false }): string;
export function git(args: string[], cwd: string | undefined, options: GitOptions): string | null;
export function git(args: string[], cwd = process.cwd(), { optional = false, input }: GitOptions = {}): string | null {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_INTERNAL_SUPER_PREFIX']) delete env[key];
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env, input, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (optional && result.status === 1) return null;
    throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
  }
  return result.stdout;
}

function context(): Context {
  const root = git(['rev-parse', '--show-toplevel']).trimEnd();
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], root).trimEnd();
  return { root, common, directory: path.join(common, 'zeke'), hooks: path.join(common, 'zeke', 'hooks') };
}

function mainWorktree(root: string): string {
  const records = git(['worktree', 'list', '--porcelain', '-z'], root).split('\0\0');
  const record = records.find(item => item.startsWith('worktree ') && !item.split('\0').includes('bare'));
  if (!record) throw new Error('No source worktree found.');
  return record.split('\0')[0].slice('worktree '.length);
}

function readConfig(projectRoot: string): Config {
  let user: unknown = {};
  try { user = JSON.parse(fs.readFileSync(path.join(projectRoot, CONFIG), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Cannot read ${CONFIG}: ${(error as Error).message}`); }
  if (!user || Array.isArray(user) || typeof user !== 'object') throw new Error(`${CONFIG} must contain an object.`);
  for (const key of Object.keys(user)) if (!(key in defaults)) throw new Error(`Unknown configuration key: ${key}`);
  const config = { ...defaults, ...user } as Config;
  if (typeof config.source !== 'string' || !config.source) throw new Error('source must be a nonempty path or "main-worktree".');
  for (const key of ['copy', 'exclude'] as const) {
    if (!Array.isArray(config[key]) || config[key].some(p => typeof p !== 'string' || !p || path.isAbsolute(p) || p.split('/').includes('..') || p.includes('\\'))) {
      throw new Error(`${key} must be an array of relative glob patterns using forward slashes.`);
    }
  }
  return config;
}

function stateAt(ctx: Context): InstallationState | null {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.directory, 'state.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

function effectiveHooks(root: string): string | null {
  return git(['config', '--path', '--get', 'core.hooksPath'], root, { optional: true })?.trimEnd() ?? null;
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const runtimeInfo = (): RuntimeInfo => ({
  name: process.versions.bun ? 'bun' : 'node',
  version: process.versions.bun ?? process.versions.node,
  executable: process.execPath,
});

export function install() {
  const ctx = context();
  const existing = stateAt(ctx);
  if (existing && effectiveHooks(ctx.root) !== ctx.hooks) throw new Error('core.hooksPath changed after installation. Restore it to Zeke before reinstalling or uninstalling.');
  if (!existing && effectiveHooks(ctx.root) === ctx.hooks) throw new Error('Zeke hook configuration exists without its installation state. Restore your previous core.hooksPath first.');
  const projectRoot = mainWorktree(ctx.root);
  readConfig(projectRoot);
  // A worktree-scoped setting can override the shared repository setting.
  const scope = git(['config', '--show-scope', '--get', 'core.hooksPath'], ctx.root, { optional: true });
  if (scope && /^(worktree|command)\s/.test(scope)) throw new Error('A worktree or command-scoped core.hooksPath overrides repository hooks. Remove that override before installing.');
  const state: InstallationState = existing ?? {
    version: 1, projectRoot,
    previousLocal: git(['config', '--local', '--get-all', 'core.hooksPath'], ctx.root, { optional: true })?.trimEnd().split('\n') ?? [],
    previousEffective: effectiveHooks(ctx.root),
    common: ctx.common,
  };
  // Finish syncing before changing hooks or refreshing an existing runtime.
  sync();
  state.runtime = runtimeInfo();
  fs.mkdirSync(ctx.hooks, { recursive: true });
  const runtime = path.join(ctx.directory, 'runtime');
  fs.mkdirSync(runtime, { recursive: true });
  for (const file of ['zeke.js', 'hook.js']) fs.copyFileSync(fileURLToPath(new URL(file, import.meta.url)), path.join(runtime, file));
  fs.writeFileSync(path.join(runtime, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(ctx.directory, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
  for (const hook of hookNames) {
    fs.writeFileSync(path.join(ctx.hooks, hook), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(runtime, 'hook.js'))} ${quote(hook)} "$@"\n`, { mode: 0o755 });
  }
  git(['config', '--local', '--replace-all', 'core.hooksPath', ctx.hooks], ctx.root);
  console.log('zeke: enabled. New worktrees will receive missing local environment files.');
}

export function uninstall() {
  const ctx = context();
  const state = stateAt(ctx);
  if (!state) { console.log('zeke: not installed.'); return; }
  if (effectiveHooks(ctx.root) !== ctx.hooks) throw new Error('core.hooksPath changed after installation; refusing to overwrite it. Restore the Zeke hooks path before uninstalling.');
  git(['config', '--local', '--unset-all', 'core.hooksPath'], ctx.root);
  for (const value of state.previousLocal) git(['config', '--local', '--add', 'core.hooksPath', value], ctx.root);
  fs.rmSync(ctx.directory, { recursive: true });
  console.log('zeke: uninstalled; previous hooks configuration restored. Copied files and project config kept.');
}

function candidates(source: string, config: Config, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(path.join(source, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (pruned.has(entry.name) || config.exclude.some(pattern => path.posix.matchesGlob(relative, pattern))) continue;
    if (entry.isDirectory()) {
      // Never cross into submodules, nested repositories, or nested worktrees.
      if (!fs.existsSync(path.join(source, relative, '.git'))) files.push(...candidates(source, config, relative));
    }
    else if (entry.isFile() && config.copy.some(pattern => path.posix.matchesGlob(relative, pattern))) files.push(relative);
  }
  return files;
}

function safeParents(root: string, relative: string, dryRun: boolean): boolean {
  let directory = root;
  for (const part of relative.split('/').slice(0, -1)) {
    directory = path.join(directory, part);
    try {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!dryRun) fs.mkdirSync(directory);
    }
  }
  return true;
}

export function sync({ dryRun = false } = {}) {
  const ctx = context();
  const projectRoot = mainWorktree(ctx.root);
  const config = readConfig(projectRoot);
  const source = fs.realpathSync(config.source === 'main-worktree' ? projectRoot : path.resolve(projectRoot, config.source));
  if (source === fs.realpathSync(ctx.root)) return { copied: 0, skipped: 0 };
  // Do not let a typo silently select an unrelated folder as a secrets source.
  if (git(['rev-parse', '--show-toplevel'], source).trimEnd() !== source || git(['rev-parse', '--path-format=absolute', '--git-common-dir'], source).trimEnd() !== ctx.common) {
    throw new Error('source must be a worktree of this repository.');
  }
  const files = candidates(source, config);
  const ignored = files.length ? new Set((git(['check-ignore', '--stdin', '-z'], source, { optional: true, input: `${files.join('\0')}\0` }) ?? '').split('\0').filter(Boolean)) : new Set();
  let copied = 0;
  let skipped = 0;
  for (const relative of files) {
    if (!safeParents(ctx.root, relative, true)) { skipped++; continue; }
    // Check ignore rules in both worktrees: a branch may have changed .gitignore.
    if (!ignored.has(relative) || git(['check-ignore', '-q', '--', relative], ctx.root, { optional: true }) === null) { skipped++; continue; }
    const destination = path.join(ctx.root, relative);
    try { fs.lstatSync(destination); skipped++; continue; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!safeParents(ctx.root, relative, dryRun)) { skipped++; continue; }
    if (!dryRun) {
      try { fs.copyFileSync(path.join(source, relative), destination, fs.constants.COPYFILE_EXCL); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') { skipped++; continue; } throw error; }
    }
    copied++;
    console.log(`zeke: ${dryRun ? 'would copy' : 'copied'} ${JSON.stringify(relative)}`);
  }
  console.log(`zeke: ${copied} ${dryRun ? 'to copy' : 'copied'}, ${skipped} skipped.`);
  return { copied, skipped };
}

export function run(args: string[]): void {
  const [command, ...flags] = args;
  if (command === '--version' || command === '-v') {
    if (flags.length) throw new Error('Unknown option. Run zeke --help.');
    console.log(JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version);
    return;
  }
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(`zeke — environment files for Git worktrees\n\nUsage: zeke <command>\n\n  init             Create zeke.config.json, enable hooks, and sync\n  install          Enable or refresh hooks and sync this worktree\n  sync [--dry-run] Copy missing ignored files into this worktree\n  status           Show installation, hook runtime, and source configuration\n  uninstall        Restore previous Git hooks configuration\n  --version, -v    Print the installed package version\n\nRequires Node.js >=22.20 or Bun >=1.4.4, plus Git. Run inside a Git worktree.\nFor Bun: bun /path/to/dist/bin/zeke.js install (or bun --bun zeke install with a local package).`);
    return;
  }
  if (flags.some(flag => command !== 'sync' || flag !== '--dry-run')) throw new Error('Unknown option. Run zeke --help.');
  switch (command) {
    case 'init': {
      const ctx = context();
      const file = path.join(mainWorktree(ctx.root), CONFIG);
      try { fs.writeFileSync(file, `${JSON.stringify(defaults, null, 2)}\n`, { flag: 'wx' }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      install();
      break;
    }
    case 'install': install(); break;
    case 'sync': sync({ dryRun: flags.includes('--dry-run') }); break;
    case 'uninstall': uninstall(); break;
    case 'status': {
      const ctx = context();
      const state = stateAt(ctx);
      console.log(JSON.stringify({ installed: Boolean(state) && effectiveHooks(ctx.root) === ctx.hooks, hooksPath: effectiveHooks(ctx.root), runtime: state?.runtime ?? null, projectRoot: mainWorktree(ctx.root), config: readConfig(mainWorktree(ctx.root)) }, null, 2));
      break;
    }
    default: throw new Error(`Unknown command: ${command}. Run zeke --help.`);
  }
}
