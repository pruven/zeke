import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { InstallationState } from './zeke.js';
import { sync } from './zeke.js';

const [hook = '', ...args] = process.argv.slice(2);
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const state: InstallationState = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'));
  const previous = path.resolve(state.previousEffective ?? path.join(state.common, 'hooks'), hook);
  let status = 0;
  try {
    fs.accessSync(previous, fs.constants.X_OK);
    const result = spawnSync(previous, args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.signal) {
      process.kill(process.pid, result.signal);
    }
    status = result.status ?? 1;
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
  // A zero old HEAD identifies the initial checkout (SHA-1 and SHA-256).
  // Normal branch switches still forward hooks, but do not reseed env files.
  if (hook === 'post-checkout' && /^0+$/.test(args[0] ?? '') && args[2] === '1') {
    try { sync(); }
    catch (error) { console.error(`zeke: automatic copy failed: ${(error as Error).message}. Run zeke sync to retry.`); }
  }
  process.exitCode = status;
} catch (error) {
  console.error(`zeke: hook failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
