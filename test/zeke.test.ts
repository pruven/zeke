import type { TestContext } from 'node:test';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/zeke.js', import.meta.url));
const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Zeke Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Zeke Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT']) delete env[key];
function exec(cwd: string, command: string, args: string[], success = true) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  if (success) assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return result;
}
const git = (cwd: string, ...args: string[]) => exec(cwd, 'git', args);
const zeke = (cwd: string, ...args: string[]) => exec(cwd, process.execPath, [cli, ...args]);

test('version flags work outside a Git repository and match the package metadata', () => {
  const expected = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  for (const flag of ['--version', '-v']) {
    assert.equal(zeke(os.tmpdir(), flag).stdout.trim(), expected);
  }
});
function write(root: string, file: string, contents: string, mode?: number) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), contents, { mode });
}
function fixture(t: TestContext) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zeke 'test "));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'main repo');
  fs.mkdirSync(root);
  git(root, 'init', '-b', 'main');
  write(root, '.gitignore', '.env\n.env.*\n!.env.example\nnode_modules/\n');
  write(root, '.env.example', 'TOKEN=\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'initial');
  return { root, temp, worktree(name = 'feature', checkout = true) {
    const target = path.join(temp, name);
    git(root, 'worktree', 'add', ...(checkout ? [] : ['--no-checkout']), '-b', name, target);
    return target;
  } };
}

test('initial checkout copies ignored env files recursively, excluding examples and dependencies', t => {
  const f = fixture(t);
  write(f.root, '.env', 'TOKEN=private-root\n', 0o600);
  write(f.root, '.env.local', 'TOKEN=private-local\n');
  write(f.root, 'apps/api/.env', 'TOKEN=private-nested\n');
  write(f.root, 'node_modules/pkg/.env', 'DO_NOT_COPY=1');
  zeke(f.root, 'init');
  const target = f.worktree();
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=private-root\n');
  assert.equal(fs.statSync(path.join(target, '.env')).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(path.join(target, '.env.local'), 'utf8'), 'TOKEN=private-local\n');
  assert.equal(fs.readFileSync(path.join(target, 'apps/api/.env'), 'utf8'), 'TOKEN=private-nested\n');
  assert.equal(fs.readFileSync(path.join(target, '.env.example'), 'utf8'), 'TOKEN=\n');
  assert.equal(fs.existsSync(path.join(target, 'node_modules')), false);
  assert.equal(JSON.parse(zeke(target, 'status').stdout).installed, true);
});

test('install enables hooks and syncs the current worktree without adding project files', t => {
  const f = fixture(t);
  write(f.root, '.env', 'TOKEN=source');
  write(f.root, 'apps/api/.env.local', 'TOKEN=nested');
  const target = f.worktree();
  const before = git(target, 'status', '--porcelain', '--untracked-files=all').stdout;
  const result = zeke(target, 'install');
  assert.match(result.stdout, /enabled/);
  assert.match(result.stdout, /2 copied/);
  assert.equal(JSON.parse(zeke(target, 'status').stdout).installed, true);
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=source');
  assert.equal(fs.readFileSync(path.join(target, 'apps/api/.env.local'), 'utf8'), 'TOKEN=nested');
  for (const root of [f.root, target]) {
    for (const file of ['zeke.config.json', 'package.json', 'node_modules']) {
      assert.equal(fs.existsSync(path.join(root, file)), false);
    }
  }
  assert.equal(git(target, 'status', '--porcelain', '--untracked-files=all').stdout, before);
  write(target, '.env', 'TOKEN=target');
  fs.unlinkSync(path.join(target, 'apps/api/.env.local'));
  zeke(target, 'install');
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=target');
  assert.equal(fs.readFileSync(path.join(target, 'apps/api/.env.local'), 'utf8'), 'TOKEN=nested');
  const next = f.worktree('next');
  assert.equal(fs.readFileSync(path.join(next, '.env'), 'utf8'), 'TOKEN=source');
});

for (const source of ['missing', 'unrelated']) {
  for (const reinstall of [false, true]) {
    test(`${reinstall ? 'reinstall' : 'install'} with a ${source} source leaves hooks and runtime unchanged`, t => {
      const f = fixture(t);
      const target = f.worktree();
      git(f.root, 'config', '--local', 'core.hooksPath', '.custom-hooks');
      if (reinstall) zeke(target, 'install');
      const hooksBefore = git(f.root, 'config', '--local', '--get', 'core.hooksPath').stdout;
      const directory = path.join(f.root, '.git/zeke');
      const statePath = path.join(directory, 'state.json');
      const runtimePath = path.join(directory, 'runtime/zeke.js');
      // Make refreshes observable on a failed reinstall.
      if (reinstall) {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        state.runtime.version = 'previous-version';
        fs.writeFileSync(statePath, JSON.stringify(state));
        fs.appendFileSync(runtimePath, '\n// Previous runtime\n');
      }
      const stateBefore = reinstall ? fs.readFileSync(statePath, 'utf8') : null;
      const runtimeBefore = reinstall ? fs.readFileSync(runtimePath, 'utf8') : null;
      const sourcePath = path.join(f.temp, source);
      if (source === 'unrelated') {
        fs.mkdirSync(sourcePath);
        git(sourcePath, 'init');
      }
      write(f.root, 'zeke.config.json', JSON.stringify({ source: sourcePath }));
      const result = exec(target, process.execPath, [cli, 'install'], false);
      assert.equal(result.status, 1);
      assert.match(result.stderr, source === 'missing' ? /ENOENT/ : /source must be a worktree of this repository/);
      assert.doesNotMatch(result.stdout, /enabled/);
      assert.equal(git(f.root, 'config', '--local', '--get', 'core.hooksPath').stdout, hooksBefore);
      if (reinstall) {
        assert.equal(fs.readFileSync(statePath, 'utf8'), stateBefore);
        assert.equal(fs.readFileSync(runtimePath, 'utf8'), runtimeBefore);
      } else {
        assert.equal(fs.existsSync(directory), false);
      }
      // Fixing the source allows the same command to succeed normally.
      write(f.root, 'zeke.config.json', JSON.stringify({ source: 'main-worktree' }));
      write(f.root, '.env', 'TOKEN=source');
      zeke(target, 'install');
      assert.equal(JSON.parse(zeke(target, 'status').stdout).installed, true);
      assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=source');
    });
  }
}

test('init also syncs the current worktree while creating the shared config', t => {
  const f = fixture(t);
  write(f.root, '.env', 'TOKEN=source');
  const target = f.worktree();
  zeke(target, 'init');
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=source');
  assert.equal(fs.existsSync(path.join(f.root, 'zeke.config.json')), true);
  assert.equal(JSON.parse(zeke(target, 'status').stdout).installed, true);
});

test('manual sync, dry run, and repeated calls preserve existing values', t => {
  const f = fixture(t);
  write(f.root, '.env', 'SECRET=source');
  const target = f.worktree();
  const preview = zeke(target, 'sync', '--dry-run');
  assert.match(preview.stdout, /would copy/);
  assert.doesNotMatch(preview.stdout, /SECRET=source/);
  assert.equal(fs.existsSync(path.join(target, '.env')), false);
  zeke(target, 'sync');
  write(target, '.env', 'SECRET=target');
  zeke(target, 'sync');
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'SECRET=target');
});

test('verbose sync explains excluded, existing, tracked and nonignored files without printing values', t => {
  const f = fixture(t);
  write(f.root, 'zeke.config.json', JSON.stringify({ copy: ['**/.env*', 'local.json'] }));
  write(f.root, '.env', 'SECRET=source');
  write(f.root, '.env.local', 'SECRET=local');
  write(f.root, '.env.tracked', 'SECRET=tracked');
  git(f.root, 'add', '-f', '.env.tracked');
  git(f.root, 'commit', '-m', 'tracked env fixture');
  write(f.root, 'local.json', 'SECRET=untracked');
  const target = f.worktree();
  write(target, '.env', 'SECRET=target');
  write(target, '.gitignore', '.env\n.env.tracked\n');
  const normal = zeke(target, 'sync');
  assert.doesNotMatch(normal.stdout, /zeke: skipped /);
  const result = zeke(target, 'sync', '--dry-run', '--verbose');
  assert.match(result.stdout, /skipped "\.env" \(destination already exists\)/);
  assert.match(result.stdout, /skipped "\.env.example" \(excluded by configuration\)/);
  assert.match(result.stdout, /skipped "\.env.local" \(tracked or not ignored in destination\)/);
  assert.match(result.stdout, /skipped "\.env.tracked" \(tracked or not ignored in source\)/);
  assert.match(result.stdout, /skipped "local.json" \(tracked or not ignored in source\)/);
  assert.doesNotMatch(result.stdout + result.stderr, /SECRET=/);
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'SECRET=target');
});

test('verbose sync explains source symlinks and unsafe destination paths', t => {
  const f = fixture(t);
  write(f.root, '.env', 'SECRET=source');
  write(f.root, 'apps/api/.env', 'SECRET=nested');
  fs.symlinkSync(path.join(f.root, '.env'), path.join(f.root, '.env.link'));
  const target = f.worktree();
  fs.symlinkSync(f.temp, path.join(target, 'apps'));
  fs.symlinkSync(path.join(f.temp, 'missing'), path.join(target, '.env'));
  const result = zeke(target, 'sync', '--verbose');
  assert.match(result.stdout, /skipped "\.env.link" \(source is a symbolic link\)/);
  assert.match(result.stdout, /skipped "apps\/api\/\.env" \(destination parent is a symbolic link or not a directory\)/);
  assert.match(result.stdout, /skipped "\.env" \(destination already exists\)/);
  assert.equal(fs.existsSync(path.join(f.temp, 'api')), false);
  assert.equal(fs.existsSync(path.join(f.temp, 'missing')), false);
});

test('sync --all previews and copies missing files while preserving each worktree ignore rules and values', t => {
  const f = fixture(t);
  write(f.root, '.env', 'SECRET=source');
  write(f.root, 'apps/api/.env.local', 'SECRET=nested');
  const first = f.worktree('first');
  const second = f.worktree('second');
  write(first, '.env', 'SECRET=first');
  write(second, '.gitignore', '.env\n');
  const preview = zeke(first, 'sync', '--all', '--dry-run', '--verbose');
  for (const target of [first, second]) {
    assert.ok(preview.stdout.includes(`worktree ${JSON.stringify(target)}`));
    assert.equal(fs.existsSync(path.join(target, 'apps')), false);
  }
  assert.match(preview.stdout, /total: 2 to copy/);
  assert.doesNotMatch(preview.stdout, /SECRET=/);
  assert.equal(fs.existsSync(path.join(second, '.env')), false);
  const result = zeke(first, 'sync', '--all');
  assert.match(result.stdout, /total: 2 copied/);
  assert.equal(fs.readFileSync(path.join(first, '.env'), 'utf8'), 'SECRET=first');
  assert.equal(fs.readFileSync(path.join(first, 'apps/api/.env.local'), 'utf8'), 'SECRET=nested');
  assert.equal(fs.readFileSync(path.join(second, '.env'), 'utf8'), 'SECRET=source');
  assert.equal(fs.existsSync(path.join(second, 'apps')), false);
  assert.match(zeke(f.root, 'sync', '--all').stdout, /total: 0 copied/);
});

test('sync --all uses the configured source and includes main and detached worktrees', t => {
  const f = fixture(t);
  const source = f.worktree('source');
  write(source, '.env', 'SECRET=custom');
  write(f.root, 'zeke.config.json', JSON.stringify({ source: '../source' }));
  const detached = path.join(f.temp, 'detached');
  git(f.root, 'worktree', 'add', '--detach', detached);
  const result = zeke(source, 'sync', '--all');
  assert.equal(fs.readFileSync(path.join(f.root, '.env'), 'utf8'), 'SECRET=custom');
  assert.equal(fs.readFileSync(path.join(detached, '.env'), 'utf8'), 'SECRET=custom');
  assert.ok(!result.stdout.includes(`worktree ${JSON.stringify(source)}`));
  assert.match(result.stdout, /total: 2 copied/);
});

test('sync --all skips stale registrations and continues after a destination error', t => {
  const f = fixture(t);
  write(f.root, '.env', 'SECRET=source');
  const missing = f.worktree('missing');
  const replaced = f.worktree('replaced');
  const healthy = f.worktree('healthy');
  fs.rmSync(missing, { recursive: true });
  fs.rmSync(replaced, { recursive: true });
  fs.mkdirSync(replaced);
  git(replaced, 'init');
  write(replaced, '.gitignore', '.env\n');
  const result = exec(f.root, process.execPath, [cli, 'sync', '--all'], false);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /skipped worktree .*missing.*directory is missing/);
  assert.match(result.stderr, /destination must be a worktree of this repository/);
  assert.match(result.stderr, /Sync failed in 1 worktree/);
  assert.equal(fs.existsSync(path.join(replaced, '.env')), false);
  assert.equal(fs.readFileSync(path.join(healthy, '.env'), 'utf8'), 'SECRET=source');
});

test('sync --all works with a bare repository and skips its bare entry', t => {
  const f = fixture(t);
  const bare = path.join(f.temp, 'bare.git');
  git(f.root, 'clone', '--bare', f.root, bare);
  const source = path.join(f.temp, 'bare-source');
  const target = path.join(f.temp, 'bare-target');
  git(bare, 'worktree', 'add', source, 'main');
  git(bare, 'worktree', 'add', '-b', 'target', target);
  write(source, '.env', 'SECRET=bare-source');
  const result = zeke(target, 'sync', '--all');
  assert.match(result.stdout, /total: 1 copied/);
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'SECRET=bare-source');
  assert.equal(fs.existsSync(path.join(bare, '.env')), false);
});

test('ordinary branch switches forward hooks without repopulating deleted env files', t => {
  const f = fixture(t);
  write(f.root, '.env', 'TOKEN=source');
  zeke(f.root, 'install');
  const target = f.worktree();
  fs.unlinkSync(path.join(target, '.env'));
  git(target, 'switch', '-c', 'another-branch');
  assert.equal(fs.existsSync(path.join(target, '.env')), false);
});

test('existing native hooks retain arguments, stdin and exit status; uninstall restores defaults', t => {
  const f = fixture(t);
  write(f.root, '.git/hooks/post-checkout', '#!/bin/sh\nprintf "%s\\n" "$3" > hook-argument\n', 0o755);
  write(f.root, '.git/hooks/pre-commit', '#!/bin/sh\nexit 23\n', 0o755);
  write(f.root, '.git/hooks/pre-push', '#!/bin/sh\ncat > hook-stdin\nexit 7\n', 0o755);
  zeke(f.root, 'init');
  zeke(f.root, 'install');
  const target = f.worktree();
  assert.equal(fs.readFileSync(path.join(target, 'hook-argument'), 'utf8'), '1\n');
  const hookPath = git(f.root, 'config', '--get', 'core.hooksPath').stdout.trim();
  const push = spawnSync(path.join(hookPath, 'pre-push'), ['origin', 'url'], { cwd: target, env, input: 'ref data\n', encoding: 'utf8' });
  assert.equal(push.status, 7);
  assert.equal(fs.readFileSync(path.join(target, 'hook-stdin'), 'utf8'), 'ref data\n');
  assert.notEqual(exec(target, 'git', ['commit', '--allow-empty', '-m', 'blocked'], false).status, 0);
  zeke(target, 'uninstall');
  assert.equal(exec(f.root, 'git', ['config', '--get', 'core.hooksPath'], false).status, 1);
  assert.equal(fs.existsSync(path.join(f.root, '.git/hooks/pre-commit')), true);
});

test('relative custom hooks resolve in the new worktree, and configuration is restored', t => {
  const f = fixture(t);
  write(f.root, '.custom-hooks/post-checkout', '#!/bin/sh\nprintf custom > custom-hook-ran\n', 0o755);
  git(f.root, 'add', '.custom-hooks');
  git(f.root, 'commit', '-m', 'custom hooks');
  git(f.root, 'config', '--local', 'core.hooksPath', '.custom-hooks');
  zeke(f.root, 'install');
  const target = f.worktree();
  assert.equal(fs.readFileSync(path.join(target, 'custom-hook-ran'), 'utf8'), 'custom');
  zeke(f.root, 'uninstall');
  assert.equal(git(f.root, 'config', '--local', '--get', 'core.hooksPath').stdout.trim(), '.custom-hooks');
});

test('installed runtime works even when the original CLI installation disappears', t => {
  const f = fixture(t);
  const packageCopy = path.join(f.temp, 'temporary-package');
  fs.cpSync(path.dirname(path.dirname(cli)), packageCopy, { recursive: true });
  exec(f.root, process.execPath, [path.join(packageCopy, 'bin/zeke.js'), 'install']);
  fs.rmSync(packageCopy, { recursive: true });
  write(f.root, '.env', 'TOKEN=persisted-runtime');
  const target = f.worktree();
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=persisted-runtime');
});

test('source and destination symlinks are skipped', t => {
  const f = fixture(t);
  const outside = path.join(f.temp, 'outside');
  fs.mkdirSync(outside);
  write(f.root, 'apps/api/.env', 'TOKEN=source');
  write(f.root, '.env.local', 'TOKEN=source');
  fs.symlinkSync(path.join(f.root, '.env.local'), path.join(f.root, '.env.link'));
  const target = f.worktree();
  fs.symlinkSync(outside, path.join(target, 'apps'));
  fs.symlinkSync(path.join(outside, 'missing'), path.join(target, '.env.local'));
  zeke(target, 'sync');
  assert.equal(fs.existsSync(path.join(outside, 'api/.env')), false);
  assert.equal(fs.existsSync(path.join(target, '.env.link')), false);
  assert.equal(fs.lstatSync(path.join(target, '.env.local')).isSymbolicLink(), true);
});

test('custom patterns skip tracked and nonignored files; target ignore rules are respected', t => {
  const f = fixture(t);
  write(f.root, 'zeke.config.json', JSON.stringify({ copy: ['**/.env*', 'local.json'] }));
  write(f.root, 'local.json', 'untracked, not ignored');
  write(f.root, '.env', 'TOKEN=source');
  const target = f.worktree();
  write(target, '.gitignore', '.env.*\n!.env.example\n');
  zeke(target, 'sync');
  assert.equal(fs.existsSync(path.join(target, '.env')), false);
  assert.equal(fs.existsSync(path.join(target, 'local.json')), false);
});

test('config can select another worktree as source', t => {
  const f = fixture(t);
  const source = f.worktree('source');
  write(source, '.env', 'TOKEN=other-worktree');
  write(f.root, 'zeke.config.json', JSON.stringify({ source: '../source' }));
  zeke(f.root, 'install');
  assert.equal(fs.readFileSync(path.join(f.root, '.env'), 'utf8'), 'TOKEN=other-worktree');
  const target = f.worktree();
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=other-worktree');
});

test('changed hook settings are not overwritten on reinstall or uninstall', t => {
  const f = fixture(t);
  zeke(f.root, 'install');
  git(f.root, 'config', 'core.hooksPath', '.new-hooks');
  for (const command of ['install', 'uninstall']) {
    const result = exec(f.root, process.execPath, [cli, command], false);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /changed after installation/);
  }
  assert.equal(git(f.root, 'config', '--get', 'core.hooksPath').stdout.trim(), '.new-hooks');
});

test('malformed configuration and unknown options fail clearly', t => {
  const f = fixture(t);
  write(f.root, 'zeke.config.json', '{broken');
  assert.match(exec(f.root, process.execPath, [cli, 'install'], false).stderr, /Cannot read/);
  write(f.root, 'zeke.config.json', JSON.stringify({ copy: ['../.env'] }));
  assert.match(exec(f.root, process.execPath, [cli, 'sync'], false).stderr, /relative glob/);
  assert.equal(exec(f.root, process.execPath, [cli, 'sync', '--force'], false).status, 1);
});

test('--no-checkout does not run automatic sync; manual sync works after checkout', t => {
  const f = fixture(t);
  write(f.root, '.env', 'TOKEN=source');
  zeke(f.root, 'install');
  const target = f.worktree('feature', false);
  assert.equal(fs.existsSync(path.join(target, '.env')), false);
  git(target, 'reset', '--hard', 'HEAD');
  zeke(target, 'sync');
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=source');
});

test('installation records the active runtime and refreshes it on reinstall', t => {
  const f = fixture(t);
  zeke(f.root, 'install');
  const statePath = path.join(f.root, '.git/zeke/state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  // Simulate an older installation so reinstall must refresh runtime metadata.
  delete state.runtime;
  fs.writeFileSync(statePath, JSON.stringify(state));
  zeke(f.root, 'install');
  const status = JSON.parse(zeke(f.root, 'status').stdout);
  assert.equal(status.runtime.name, process.versions.bun ? 'bun' : 'node');
  assert.equal(status.runtime.executable, process.execPath);
  assert.equal(status.runtime.version, process.versions.bun ?? process.versions.node);
});

test('Bun installs and executes hooks without Node on PATH', { skip: !process.versions.bun }, t => {
  const f = fixture(t);
  const tools = path.join(f.temp, 'bun-only-bin');
  fs.mkdirSync(tools);
  const gitPath = exec(f.root, '/bin/sh', ['-c', 'command -v git']).stdout.trim();
  fs.symlinkSync(gitPath, path.join(tools, 'git'));
  fs.symlinkSync(process.execPath, path.join(tools, 'bun'));
  const bunEnv = { ...env, PATH: tools };
  assert.notEqual(spawnSync('node', ['--version'], { env: bunEnv }).status, 0);
  const installed = spawnSync(process.execPath, [cli, 'init'], { cwd: f.root, env: bunEnv, encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr);
  write(f.root, '.env', 'TOKEN=bun-only');
  const target = path.join(f.temp, 'bun-feature');
  const created = spawnSync(gitPath, ['worktree', 'add', '-b', 'bun-feature', target], { cwd: f.root, env: bunEnv, encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'TOKEN=bun-only');
  const status = JSON.parse(spawnSync(process.execPath, [cli, 'status'], { cwd: target, env: bunEnv, encoding: 'utf8' }).stdout);
  assert.equal(status.runtime.name, 'bun');
});

test('refuses to run with a Git older than 2.36 and shows a clear message', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zeke old git '));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const shim = path.join(temp, 'git');
  fs.writeFileSync(shim, '#!/bin/sh\necho "git version 2.34.1"\n', { mode: 0o755 });
  const result = spawnSync(process.execPath, [cli, 'status'], { cwd: temp, encoding: 'utf8', env: { ...env, PATH: `${temp}${path.delimiter}${process.env.PATH}` } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Git 2\.34\.1 is too old\. Zeke requires Git 2\.36 or newer\./);
  assert.doesNotMatch(result.stderr, /usage:/);
});

test('doctor reports healthy setup without modifying installation', t => {
  const f = fixture(t);
  zeke(f.root, 'install');
  const state = path.join(f.root, '.git/zeke/state.json');
  const before = fs.readFileSync(state, 'utf8');
  assert.match(zeke(f.root, 'doctor').stdout, /all checks passed/);
  assert.match(zeke(f.worktree(), 'doctor').stdout, /all checks passed/);
  assert.equal(fs.readFileSync(state, 'utf8'), before);
});

test('doctor reports runtime, hook conflicts, source and config problems with repairs', t => {
  const f = fixture(t);
  zeke(f.root, 'install');
  const statePath = path.join(f.root, '.git/zeke/state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.runtime.executable = path.join(f.temp, 'deleted-node');
  fs.writeFileSync(statePath, JSON.stringify(state));
  fs.unlinkSync(path.join(f.root, '.git/zeke/runtime/hook.js'));
  fs.chmodSync(path.join(f.root, '.git/zeke/hooks/post-checkout'), 0o644);
  git(f.root, 'config', '--local', 'core.hooksPath', '.husky/_');
  write(f.root, 'zeke.config.json', JSON.stringify({ source: '../deleted-source' }));
  const result = exec(f.root, process.execPath, [cli, 'doctor'], false);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /another hook manager/);
  assert.match(result.stdout, /recorded Node\/Bun executable/);
  assert.match(result.stdout, /runtime file "hook.js"/);
  assert.match(result.stdout, /Hook dispatchers/);
  assert.match(result.stdout, /configured source is missing/);
  assert.match(result.stdout, /Repair:.*zeke install/);
  assert.equal(git(f.root, 'config', '--get', 'core.hooksPath').stdout.trim(), '.husky/_');
  write(f.root, 'zeke.config.json', '{"password":"DO_NOT_PRINT_SECRET",broken');
  const invalid = exec(f.root, process.execPath, [cli, 'doctor'], false);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /config.json is unavailable or invalid/);
  assert.doesNotMatch(invalid.stdout + invalid.stderr, /DO_NOT_PRINT_SECRET/);
});

test('doctor handles absent and corrupt installation state', t => {
  const f = fixture(t);
  const absent = exec(f.root, process.execPath, [cli, 'doctor'], false);
  assert.equal(absent.status, 1);
  assert.match(absent.stdout, /not installed/);
  zeke(f.root, 'install');
  const statePath = path.join(f.root, '.git/zeke/state.json');
  fs.unlinkSync(statePath);
  assert.match(exec(f.root, process.execPath, [cli, 'doctor'], false).stdout, /installation state is missing/);
  fs.writeFileSync(statePath, '{SECRET=do-not-echo');
  const invalid = exec(f.root, process.execPath, [cli, 'doctor'], false);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /state is invalid/);
  assert.doesNotMatch(invalid.stdout + invalid.stderr, /do-not-echo/);
});

test('doctor detects worktree-scoped overrides and unrelated sources', t => {
  const f = fixture(t);
  zeke(f.root, 'install');
  const target = f.worktree();
  git(f.root, 'config', 'extensions.worktreeConfig', 'true');
  git(target, 'config', '--worktree', 'core.hooksPath', '.other-hooks');
  write(f.root, 'zeke.config.json', JSON.stringify({ source: f.temp }));
  const result = exec(target, process.execPath, [cli, 'doctor'], false);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /git config --worktree --unset-all core.hooksPath/);
  assert.match(result.stdout, /not a worktree of this repository/);
});

test('diff reports missing files, differing files and missing names without values or writes', t => {
  const f = fixture(t);
  write(f.root, '.env', 'export TOKEN=source-secret\nEMPTY=\nMULTILINE="first\nFAKE=inside-value\nlast"\n');
  write(f.root, 'apps/api/.env.local', 'NESTED=nested-secret\n');
  const target = f.worktree();
  write(target, '.env', 'TOKEN=target-secret\nEXTRA=extra-secret\n');
  const before = fs.readFileSync(path.join(target, '.env'), 'utf8');
  const result = exec(target, process.execPath, [cli, 'diff'], false);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /missing file "apps\/api\/\.env.local"/);
  assert.match(result.stdout, /differing file "\.env"/);
  assert.match(result.stdout, /missing variable "EMPTY"/);
  assert.match(result.stdout, /missing variable "MULTILINE"/);
  assert.doesNotMatch(result.stdout + result.stderr, /source-secret|target-secret|nested-secret|extra-secret|FAKE|inside-value/);
  assert.match(result.stdout, /1 missing file\(s\), 1 differing file\(s\), 2 missing variable\(s\)/);
  assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(target, 'apps')), false);
  assert.match(zeke(f.root, 'diff').stdout, /0 missing file\(s\), 0 differing/);
  write(target, '.env', fs.readFileSync(path.join(f.root, '.env'), 'utf8'));
  zeke(target, 'sync');
  assert.match(zeke(target, 'diff').stdout, /0 missing file\(s\), 0 differing/);
});

test('diff respects configured sources, exclusions, ignore rules and symlinks', t => {
  const f = fixture(t);
  const source = f.worktree('source');
  const target = f.worktree('target');
  write(f.root, 'zeke.config.json', JSON.stringify({ source: '../source', copy: ['**/.env*', 'local.json'] }));
  write(source, '.env', 'TOKEN=secret');
  write(source, '.env.local', 'TOKEN=secret');
  write(source, 'local.json', '{"secret":"unignored-secret"}');
  write(source, 'apps/.env', 'TOKEN=secret');
  fs.symlinkSync(path.join(source, '.env'), path.join(source, '.env.link'));
  fs.symlinkSync(f.temp, path.join(target, 'apps'));
  fs.symlinkSync(path.join(source, '.env'), path.join(target, '.env'));
  write(target, '.gitignore', '.env\napps/\n');
  const result = exec(target, process.execPath, [cli, 'diff'], false);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /source is a symbolic link/);
  assert.match(result.stdout, /destination is not a regular file/);
  assert.match(result.stdout, /destination parent is a symbolic link/);
  assert.match(result.stdout, /tracked or not ignored/);
  assert.doesNotMatch(result.stdout + result.stderr, /TOKEN=|unignored-secret|missing file "\.env.example"/);
  assert.equal(fs.lstatSync(path.join(target, '.env')).isSymbolicLink(), true);
});

test('diff compares custom files as bytes and reports value-only drift without variable names', t => {
  const f = fixture(t);
  write(f.root, 'zeke.config.json', JSON.stringify({ copy: ['**/.env', 'local.json'] }));
  write(f.root, '.gitignore', '.env\nlocal.json\n');
  git(f.root, 'add', '.gitignore');
  git(f.root, 'commit', '-m', 'ignore local json');
  write(f.root, '.env', 'KEY=source-secret\n');
  write(f.root, 'local.json', '{"password":"source-secret"}');
  const target = f.worktree();
  write(target, '.env', 'KEY=target-secret\n');
  write(target, 'local.json', '{"password":"target-secret"}');
  const result = exec(target, process.execPath, [cli, 'diff'], false);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /2 differing file\(s\), 0 missing variable/);
  assert.doesNotMatch(result.stdout + result.stderr, /source-secret|target-secret|password/);
});

test('reinstall repairs runtime files and nonexecutable dispatchers diagnosed by doctor', t => {
  const f = fixture(t);
  zeke(f.root, 'install');
  fs.unlinkSync(path.join(f.root, '.git/zeke/runtime/zeke.js'));
  fs.chmodSync(path.join(f.root, '.git/zeke/hooks/post-checkout'), 0o644);
  assert.equal(exec(f.root, process.execPath, [cli, 'doctor'], false).status, 1);
  zeke(f.root, 'install');
  assert.match(zeke(f.root, 'doctor').stdout, /all checks passed/);
});
