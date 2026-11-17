import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';

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

const MIN_GIT = [2, 36, 0];
export function parseGitVersion(output: string): number[] | null {
  const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}
export function isSupportedGit(version: number[]): boolean {
  for (let i = 0; i < MIN_GIT.length; i++) {
    if (version[i] !== MIN_GIT[i]) return version[i] > MIN_GIT[i];
  }
  return true;
}
// `git worktree list --porcelain -z` needs Git 2.36+. Fail early with a clear message.
function requireGit() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (result.error) throw new Error('Git was not found. Install Git 2.36 or newer.');
  const version = parseGitVersion(result.stdout);
  if (version && !isSupportedGit(version)) {
    throw new Error(`Git ${version.join('.')} is too old. Zeke requires Git ${MIN_GIT.slice(0, 2).join('.')} or newer.`);
  }
}

function context(): Context {
  requireGit();
  const root = git(['rev-parse', '--show-toplevel']).trimEnd();
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], root).trimEnd();
  return { root, common, directory: path.join(common, 'zeke'), hooks: path.join(common, 'zeke', 'hooks') };
}

function worktrees(root: string): { root: string; bare: boolean }[] {
  const records = git(['worktree', 'list', '--porcelain', '-z'], root).split('\0\0');
  return records.filter(item => item.startsWith('worktree ')).map(item => ({
    root: item.split('\0')[0].slice('worktree '.length),
    bare: item.split('\0').includes('bare'),
  }));
}

function mainWorktree(root: string): string {
  const main = worktrees(root).find(item => !item.bare);
  if (!main) throw new Error('No source worktree found.');
  return main.root;
}

function readConfig(projectRoot: string): Config {
  let user: unknown = {};
  try { user = JSON.parse(fs.readFileSync(path.join(projectRoot, CONFIG), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Cannot read ${CONFIG}: ${(error as Error).message}`); }
  if (!user || Array.isArray(user) || typeof user !== 'object') throw new Error(`${CONFIG} must contain an object.`);
  for (const key of Object.keys(user)) if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown configuration key: ${key}`);
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
const hookScript = (executable: string, runtime: string, hook: string) =>
  `#!/bin/sh\nexec ${quote(executable)} ${quote(path.join(runtime, 'hook.js'))} ${quote(hook)} "$@"\n`;
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
    const file = path.join(ctx.hooks, hook);
    fs.writeFileSync(file, hookScript(process.execPath, runtime, hook), { mode: 0o755 });
    // writeFile's mode only applies to new files; refresh damaged permissions too.
    fs.chmodSync(file, 0o755);
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

function candidates(source: string, config: Config, skip: (file: string, reason: string) => void, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(path.join(source, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (pruned.has(entry.name)) continue;
    const matches = config.copy.some(pattern => path.posix.matchesGlob(relative, pattern));
    if (config.exclude.some(pattern => path.posix.matchesGlob(relative, pattern))) {
      if (matches || entry.isDirectory()) skip(relative, 'excluded by configuration');
      continue;
    }
    if (entry.isDirectory()) {
      // Never cross into submodules, nested repositories, or nested worktrees.
      if (!fs.existsSync(path.join(source, relative, '.git'))) files.push(...candidates(source, config, skip, relative));
    }
    else if (matches) {
      if (entry.isFile()) files.push(relative);
      else skip(relative, entry.isSymbolicLink() ? 'source is a symbolic link' : 'source is not a regular file');
    }
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

function sourceAt(ctx: Context, projectRoot: string, config: Config): string {
  const source = fs.realpathSync(config.source === 'main-worktree' ? projectRoot : path.resolve(projectRoot, config.source));
  if (git(['rev-parse', '--show-toplevel'], source).trimEnd() !== source || git(['rev-parse', '--path-format=absolute', '--git-common-dir'], source).trimEnd() !== ctx.common) {
    throw new Error('source must be a worktree of this repository.');
  }
  return source;
}

export function sync({ dryRun = false, verbose = false, all = false } = {}) {
  const ctx = context();
  const projectRoot = mainWorktree(ctx.root);
  const config = readConfig(projectRoot);
  const source = sourceAt(ctx, projectRoot, config);
  if (!all && source === fs.realpathSync(ctx.root)) return { copied: 0, skipped: 0 };
  const sourceSkipped: { file: string; reason: string }[] = [];
  const files = candidates(source, config, (file, reason) => sourceSkipped.push({ file, reason }));
  const ignored = files.length ? new Set((git(['check-ignore', '--stdin', '-z'], source, { optional: true, input: `${files.join('\0')}\0` }) ?? '').split('\0').filter(Boolean)) : new Set<string>();
  const targets = all ? worktrees(ctx.root).filter(item => !item.bare).map(item => item.root) : [ctx.root];
  const total = { copied: 0, skipped: 0 };
  let failed = 0;
  for (const target of targets) {
    try {
      // Missing registrations can remain after a worktree directory is removed.
      if (!fs.existsSync(target)) {
        console.log(`zeke: skipped worktree ${JSON.stringify(target)} (directory is missing).`);
        continue;
      }
      if (fs.realpathSync(target) === source) continue;
      if (all) console.log(`zeke: worktree ${JSON.stringify(target)}`);
      if (all && (git(['rev-parse', '--show-toplevel'], target).trimEnd() !== fs.realpathSync(target) || git(['rev-parse', '--path-format=absolute', '--git-common-dir'], target).trimEnd() !== ctx.common)) {
        throw new Error('destination must be a worktree of this repository.');
      }
      syncTarget(ctx, target, source, files, ignored, sourceSkipped, dryRun, verbose, total);
    } catch (error) {
      if (!all) throw error;
      failed++;
      console.error(`zeke: sync failed for worktree ${JSON.stringify(target)}: ${(error as Error).message}`);
    }
  }
  if (all) console.log(`zeke: total: ${total.copied} ${dryRun ? 'to copy' : 'copied'}, ${total.skipped} skipped.`);
  if (failed) throw new Error(`Sync failed in ${failed} worktree(s). Other worktrees were processed; run zeke sync --all to retry.`);
  return total;
}

function syncTarget(ctx: Context, target: string, source: string, files: string[], ignored: Set<string>, sourceSkipped: { file: string; reason: string }[], dryRun: boolean, verbose: boolean, total: { copied: number; skipped: number }) {
  let copied = 0;
  let skipped = 0;
  const skip = (file: string, reason: string) => {
    skipped++;
    total.skipped++;
    if (verbose) console.log(`zeke: skipped ${JSON.stringify(file)} (${reason})`);
  };
  for (const { file, reason } of sourceSkipped) skip(file, reason);
  for (const relative of files) {
    if (!safeParents(target, relative, true)) { skip(relative, 'destination parent is a symbolic link or not a directory'); continue; }
    // Check ignore rules in both worktrees: a branch may have changed .gitignore.
    if (!ignored.has(relative)) { skip(relative, 'tracked or not ignored in source'); continue; }
    if (git(['check-ignore', '-q', '--', relative], target, { optional: true }) === null) { skip(relative, 'tracked or not ignored in destination'); continue; }
    const destination = path.join(target, relative);
    try { fs.lstatSync(destination); skip(relative, 'destination already exists'); continue; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!safeParents(target, relative, dryRun)) { skip(relative, 'destination parent is a symbolic link or not a directory'); continue; }
    if (!dryRun) {
      const original = path.join(source, relative);
      const contents = fs.readFileSync(original);
      const sourceMode = fs.statSync(original).mode & 0o777;
      let fd: number;
      try { fd = fs.openSync(destination, 'wx', sourceMode); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') { skip(relative, 'destination already exists'); continue; } throw error; }
      let copy: fs.Stats | undefined;
      try {
        try {
          fs.writeFileSync(fd, contents);
          fs.fchmodSync(fd, sourceMode);
        } finally {
          // Snapshot the open file, even after a partial write. If it cannot be
          // identified, leave the path alone rather than guessing during cleanup.
          try { copy = fs.fstatSync(fd); } catch { /* cleanup must be conservative */ }
          fs.closeSync(fd);
        }
        if (!copy) throw new Error('Cannot verify the copied file.');
        saveBaseline(ctx, target, relative, contents, copy.mode & 0o777);
      } catch (error) {
        try {
          if (copy && safeParents(target, relative, true)) {
            const current = fs.lstatSync(destination);
            if (current.isFile() && current.dev === copy.dev && current.ino === copy.ino &&
                current.size === copy.size && current.mode === copy.mode &&
                current.mtimeMs === copy.mtimeMs && current.ctimeMs === copy.ctimeMs) {
              fs.unlinkSync(destination);
            }
          }
        } catch { /* preserve the original copy error if cleanup fails */ }
        throw error;
      }
    }
    copied++;
    total.copied++;
    console.log(`zeke: ${dryRun ? 'would copy' : 'copied'} ${JSON.stringify(relative)}`);
  }
  console.log(`zeke: ${copied} ${dryRun ? 'to copy' : 'copied'}, ${skipped} skipped.`);
  return { copied, skipped };
}

interface Baseline {
  version: 1;
  file: string;
  hash: string;
  mode: number;
}
const digest = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const trackingDirectory = (ctx: Context, target: string) =>
  path.join(ctx.common, 'zeke-data', 'worktrees', digest(fs.realpathSync(target)));
const baselinePath = (ctx: Context, target: string, file: string) =>
  path.join(trackingDirectory(ctx, target), 'files', `${digest(file)}.json`);

// Metadata and backups are private and separate from the uninstallable runtime.
// Reject symlinks in this tree before reading or writing any records.
function privateDirectory(common: string, directory: string, create: boolean): boolean {
  let current = common;
  for (const part of path.relative(common, directory).split(path.sep)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe Zeke tracking directory. Restore its real directory before retrying.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) return false;
      try { fs.mkdirSync(current, { mode: 0o700 }); }
      catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST' || !fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink()) throw mkdirError;
      }
    }
  }
  return true;
}

function saveBaseline(ctx: Context, target: string, file: string, contents: Buffer, mode: number) {
  const record = baselinePath(ctx, target, file);
  privateDirectory(ctx.common, path.dirname(record), true);
  const temporary = `${record}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, file, hash: digest(contents), mode } satisfies Baseline), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, record);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function readBaseline(ctx: Context, target: string, file: string): Baseline | null {
  const record = baselinePath(ctx, target, file);
  if (!privateDirectory(ctx.common, path.dirname(record), false)) return null;
  try {
    if (!fs.lstatSync(record).isFile()) throw new Error();
    const value = JSON.parse(fs.readFileSync(record, 'utf8')) as Baseline;
    if (value.version !== 1 || value.file !== file || !/^[a-f0-9]{64}$/.test(value.hash) ||
        !Number.isInteger(value.mode) || value.mode < 0 || value.mode > 0o777) throw new Error();
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Invalid or unreadable copy record for ${JSON.stringify(file)}. Preserve the file and tracking record; refresh cannot safely infer its original contents.`);
  }
}

export function refresh({ dryRun = false } = {}) {
  const ctx = context();
  const projectRoot = mainWorktree(ctx.root);
  let config: Config;
  try { config = readConfig(projectRoot); }
  catch { throw new Error('Invalid or unreadable zeke.config.json. Run zeke doctor for repair instructions.'); }
  let source: string;
  try { source = sourceAt(ctx, projectRoot, config); }
  catch { throw new Error('Source is unavailable or is not a worktree of this repository. Run zeke doctor for repair instructions.'); }
  const total = { refreshed: 0, unchanged: 0, skipped: 0 };
  const summary = () => console.log(`zeke: refresh: ${total.refreshed} ${dryRun ? 'to refresh' : 'refreshed'}, ${total.unchanged} unchanged, ${total.skipped} skipped.`);
  if (source === fs.realpathSync(ctx.root)) { summary(); return total; }
  const directory = trackingDirectory(ctx, ctx.root);
  const lock = path.join(directory, 'refresh.lock');
  if (!dryRun) {
    privateDirectory(ctx.common, directory, true);
    try { fs.mkdirSync(lock, { mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      throw new Error(`Refresh is locked. Wait for the other refresh to finish. If it was interrupted, remove ${JSON.stringify(lock)} after confirming no refresh is running.`);
    }
  }
  const skip = (file: string, reason: string) => {
    total.skipped++;
    console.log(`zeke: skipped ${JSON.stringify(file)} (${reason})`);
  };
  let backups: string | undefined;
  try {
    const files = candidates(source, config, (file, reason) => {
      if (reason !== 'excluded by configuration') skip(file, reason);
    });
    for (const relative of files.sort()) {
      if (!safeParents(ctx.root, relative, true)) { skip(relative, 'destination parent is a symbolic link or not a directory'); continue; }
      if (git(['check-ignore', '-q', '--', relative], source, { optional: true }) === null ||
          git(['check-ignore', '-q', '--', relative], ctx.root, { optional: true }) === null) {
        skip(relative, 'tracked or not ignored in source or destination'); continue;
      }
      const destination = path.join(ctx.root, relative);
      let stat: fs.Stats;
      try { stat = fs.lstatSync(destination); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        skip(relative, 'destination is missing; run zeke sync to copy it'); continue;
      }
      if (!stat.isFile()) { skip(relative, 'destination is not a regular file'); continue; }
      const baseline = readBaseline(ctx, ctx.root, relative);
      if (!baseline) { skip(relative, 'no recorded Zeke copy; existing and legacy files are preserved'); continue; }
      const current = fs.readFileSync(destination);
      if (digest(current) !== baseline.hash || (stat.mode & 0o777) !== baseline.mode) {
        skip(relative, 'locally modified since the last Zeke copy'); continue;
      }
      const original = path.join(source, relative);
      // Recheck source type before reading; never follow a source symlink.
      const fd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      let contents: Buffer;
      try {
        if (!fs.fstatSync(fd).isFile()) { skip(relative, 'source is not a regular file'); continue; }
        contents = fs.readFileSync(fd);
      } finally { fs.closeSync(fd); }
      if (contents.equals(current)) { total.unchanged++; continue; }
      if (dryRun) {
        total.refreshed++;
        console.log(`zeke: would refresh ${JSON.stringify(relative)} (backup will be saved before replacement)`);
        continue;
      }
      if (!backups) {
        const parent = path.join(directory, 'backups');
        privateDirectory(ctx.common, parent, true);
        backups = fs.mkdtempSync(path.join(parent, 'refresh-'));
      }
      const backup = path.join(backups, relative);
      privateDirectory(ctx.common, path.dirname(backup), true);
      // Save and flush the exact previous bytes before attempting replacement.
      const backupFd = fs.openSync(backup, 'wx', baseline.mode);
      try { fs.writeFileSync(backupFd, current); fs.fsyncSync(backupFd); }
      finally { fs.closeSync(backupFd); }
      console.log(`zeke: backup ${JSON.stringify(relative)} saved to ${JSON.stringify(backup)}`);
      const temporary = path.join(path.dirname(destination), `.zeke-refresh-${randomUUID()}`);
      try {
        const temporaryFd = fs.openSync(temporary, 'wx', baseline.mode);
        try {
          fs.writeFileSync(temporaryFd, contents);
          fs.fchmodSync(temporaryFd, baseline.mode);
          fs.fsyncSync(temporaryFd);
        } finally { fs.closeSync(temporaryFd); }
        // Catch edits and editor atomic saves made while preparing the backup.
        const latest = fs.lstatSync(destination);
        if (!safeParents(ctx.root, relative, true) || !latest.isFile() || latest.ino !== stat.ino || latest.dev !== stat.dev ||
            (latest.mode & 0o777) !== baseline.mode || digest(fs.readFileSync(destination)) !== baseline.hash) {
          skip(relative, 'destination changed during refresh; backup retained'); continue;
        }
        fs.renameSync(temporary, destination);
        saveBaseline(ctx, ctx.root, relative, contents, baseline.mode);
      } finally { fs.rmSync(temporary, { force: true }); }
      total.refreshed++;
      console.log(`zeke: refreshed ${JSON.stringify(relative)}`);
    }
  } finally {
    if (!dryRun) fs.rmdirSync(lock);
  }
  summary();
  return total;
}

// Diagnostics deliberately avoid echoing parser errors or file contents: a
// malformed config or dotenv file can contain credentials even in an error.
export function doctor(): number {
  const ctx = context();
  let problems = 0;
  const issue = (message: string, repair: string) => {
    problems++;
    console.log(`zeke: problem: ${message}\n  Repair: ${repair}`);
  };
  const reinstall = 'Run zeke install with your chosen Node or Bun runtime to refresh hooks and runtime paths.';
  let state: InstallationState | null = null;
  let invalidState = false;
  try {
    state = stateAt(ctx);
    if (state && (state.version !== 1 || typeof state.projectRoot !== 'string' || typeof state.common !== 'string' ||
      !Array.isArray(state.previousLocal) || state.previousLocal.some(value => typeof value !== 'string') ||
      !(state.previousEffective === null || typeof state.previousEffective === 'string'))) throw new Error();
  } catch {
    invalidState = true;
    state = null;
    issue('Installation state is invalid or unreadable.', `Recover ${JSON.stringify(path.join(ctx.directory, 'state.json'))} from a backup before reinstalling; it records the previous hook configuration.`);
  }
  const effective = effectiveHooks(ctx.root);
  const scope = git(['config', '--show-scope', '--get', 'core.hooksPath'], ctx.root, { optional: true });
  if (scope && /^(worktree|command)\s/.test(scope)) {
    issue('A worktree or command-scoped core.hooksPath overrides shared repository hooks.',
      scope.startsWith('worktree') ? 'Run git config --worktree --unset-all core.hooksPath, then run zeke doctor again.' : 'Remove the git -c core.hooksPath override or GIT_CONFIG_COUNT hook override, then run zeke doctor again.');
  }
  if (state && effective !== ctx.hooks) {
    issue('core.hooksPath changed after installation; another hook manager may have replaced Zeke.',
      `Finish setup of the other hook manager first. To restore the saved chain, run git config --local core.hooksPath ${quote(ctx.hooks)}, then zeke uninstall, then zeke install. If adopting a new hook manager, preserve state.json and explicitly set its intended hooks path after uninstalling, before reinstalling Zeke.`);
  } else if (!state && !invalidState) {
    issue(effective === ctx.hooks ? 'Zeke hooks are configured but installation state is missing.' : 'Zeke hooks are not installed.',
      effective === ctx.hooks ? 'Restore state.json from a backup, or explicitly restore your previous core.hooksPath before running zeke install.' : 'Run zeke install after any other hook managers finish setup.');
  }
  if (state) {
    if (state.common !== ctx.common || state.projectRoot !== mainWorktree(ctx.root)) {
      issue('Saved repository paths no longer match this checkout; the repository may have moved.',
        `Run git config --local core.hooksPath ${quote(ctx.hooks)}, then zeke uninstall and zeke install from the new location.`);
    }
    try {
      if (!state.runtime || !['node', 'bun'].includes(state.runtime.name) || !path.isAbsolute(state.runtime.executable)) throw new Error();
      fs.accessSync(state.runtime.executable, fs.constants.X_OK);
      if (!fs.statSync(state.runtime.executable).isFile()) throw new Error();
    } catch { issue('The recorded Node/Bun executable is missing, invalid, or not executable.', reinstall); }
    for (const file of ['zeke.js', 'hook.js', 'package.json']) {
      try {
        const contents = fs.readFileSync(path.join(ctx.directory, 'runtime', file), 'utf8');
        if (!contents.trim() || (file === 'package.json' && JSON.parse(contents).type !== 'module')) throw new Error();
      } catch { issue(`Installed runtime file ${JSON.stringify(file)} is missing, unreadable, or invalid.`, reinstall); }
    }
    const broken = hookNames.filter(hook => {
      try {
        const file = path.join(ctx.hooks, hook);
        fs.accessSync(file, fs.constants.X_OK);
        const expected = hookScript(state!.runtime!.executable, path.join(ctx.directory, 'runtime'), hook);
        return fs.readFileSync(file, 'utf8') !== expected;
      } catch { return true; }
    });
    if (broken.length) issue(`Hook dispatchers are missing, modified, or not executable: ${broken.join(', ')}.`, reinstall);
  }
  let projectRoot: string | undefined;
  let config: Config | undefined;
  try {
    projectRoot = mainWorktree(ctx.root);
    config = readConfig(projectRoot);
  } catch {
    issue('The main worktree or its zeke.config.json is unavailable or invalid.',
      'Restore the main worktree and edit its zeke.config.json: use only source, copy, and exclude; source must be a nonempty string and patterns must be relative forward-slash globs without .. segments. Missing config uses defaults.');
  }
  if (projectRoot && config) {
    try { sourceAt(ctx, projectRoot, config); }
    catch { issue('The configured source is missing, unreadable, or not a worktree of this repository.',
      'Restore the source directory, or set source in the main worktree’s zeke.config.json to "main-worktree" or the root of an existing worktree listed by git worktree list.'); }
  }
  console.log(`zeke: doctor: ${problems ? `${problems} problem(s) found.` : 'all checks passed.'}`);
  return problems;
}

export function diff(): number {
  const ctx = context();
  const projectRoot = mainWorktree(ctx.root);
  let config: Config;
  try { config = readConfig(projectRoot); }
  catch { throw new Error('Invalid or unreadable zeke.config.json. Run zeke doctor for repair instructions.'); }
  let source: string;
  try { source = sourceAt(ctx, projectRoot, config); }
  catch { throw new Error('Source is unavailable or is not a worktree of this repository. Run zeke doctor for repair instructions.'); }
  let missing = 0;
  let differing = 0;
  let variables = 0;
  let skipped = 0;
  const skip = (file: string, reason: string) => {
    skipped++;
    console.log(`zeke: skipped ${JSON.stringify(file)} (${reason})`);
  };
  if (source !== fs.realpathSync(ctx.root)) {
    const files = candidates(source, config, (file, reason) => {
      if (reason !== 'excluded by configuration') skip(file, reason);
    });
    for (const relative of files.sort()) {
      if (!safeParents(ctx.root, relative, true)) { skip(relative, 'destination parent is a symbolic link or not a directory'); continue; }
      if (git(['check-ignore', '-q', '--', relative], source, { optional: true }) === null ||
          git(['check-ignore', '-q', '--', relative], ctx.root, { optional: true }) === null) {
        skip(relative, 'tracked or not ignored in source or destination'); continue;
      }
      const destination = path.join(ctx.root, relative);
      try {
        if (!fs.lstatSync(destination).isFile()) { skip(relative, 'destination is not a regular file'); continue; }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        missing++;
        console.log(`zeke: missing file ${JSON.stringify(relative)}`);
        continue;
      }
      const original = fs.readFileSync(path.join(source, relative));
      const current = fs.readFileSync(destination);
      if (original.equals(current)) continue;
      differing++;
      console.log(`zeke: differing file ${JSON.stringify(relative)}`);
      if (/^\.env(?:\.|$)/.test(path.basename(relative))) {
        const expected = parseEnv(original.toString('utf8'));
        const actual = parseEnv(current.toString('utf8'));
        for (const key of Object.keys(expected).sort()) {
          // Only names are reported. No dotenv contents or parser errors escape.
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !Object.hasOwn(actual, key)) {
            variables++;
            console.log(`zeke: missing variable ${JSON.stringify(key)} in ${JSON.stringify(relative)}`);
          }
        }
      }
    }
  }
  console.log(`zeke: diff: ${missing} missing file(s), ${differing} differing file(s), ${variables} missing variable(s), ${skipped} skipped.`);
  return missing + differing + skipped;
}

export function run(args: string[]): void {
  const [command, ...flags] = args;
  if (command === '--version' || command === '-v') {
    if (flags.length) throw new Error('Unknown option. Run zeke --help.');
    console.log(JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version);
    return;
  }
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(`zeke — environment files for Git worktrees\n\nUsage: zeke <command>\n\n  init             Create zeke.config.json, enable hooks, and sync\n  install          Enable or refresh hooks and sync this worktree\n  sync [options]   Copy missing ignored files into this worktree\n    --all          Sync all worktrees from the configured source\n    --dry-run      Preview copies without writing files\n    --verbose      Show skipped paths and reasons\n  refresh [--dry-run] Update unedited Zeke copies, saving backups\n  status           Show installation, hook runtime, and source configuration\n  doctor           Diagnose setup problems and show repair instructions\n  diff             Report drift from source without displaying values\n  uninstall        Restore previous Git hooks configuration\n  --version, -v    Print the installed package version\n\nRequires Node.js >=22.20 or Bun >=1.4.4, plus Git 2.36+. Run inside a Git worktree.\nFor Bun: bun /path/to/dist/bin/zeke.js install (or bun --bun zeke install with a local package).`);
    return;
  }
  const allowed = command === 'sync' ? ['--dry-run', '--verbose', '--all'] : command === 'refresh' ? ['--dry-run'] : [];
  if (flags.some(flag => !allowed.includes(flag))) throw new Error('Unknown option. Run zeke --help.');
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
    case 'sync': sync({ dryRun: flags.includes('--dry-run'), verbose: flags.includes('--verbose'), all: flags.includes('--all') }); break;
    case 'refresh': if (refresh({ dryRun: flags.includes('--dry-run') }).skipped) process.exitCode = 1; break;
    case 'doctor': if (doctor()) process.exitCode = 1; break;
    case 'diff': if (diff()) process.exitCode = 1; break;
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
