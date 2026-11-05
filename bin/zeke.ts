#!/usr/bin/env node
import { run } from '../lib/zeke.js';

try {
  run(process.argv.slice(2));
} catch (error) {
  console.error(`zeke: ${(error as Error).message}`);
  process.exitCode = 1;
}
