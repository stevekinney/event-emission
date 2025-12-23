#!/usr/bin/env bun
/**
 * Build script for event-emission
 *
 * Produces:
 * - ESM build (dist/*.js)
 * - CJS build (dist/*.cjs)
 * - TypeScript declarations (dist/*.d.ts)
 */

import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { $ } from 'bun';

const ROOT = import.meta.dirname ? join(import.meta.dirname, '..') : process.cwd();
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');
const ENTRYPOINT = join(SRC, 'index.ts');

async function clean(): Promise<void> {
  console.log('Cleaning dist/...');
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

async function buildESM(): Promise<void> {
  console.log('Building ESM...');
  const result = await Bun.build({
    entrypoints: [ENTRYPOINT],
    outdir: DIST,
    format: 'esm',
    target: 'bun',
    sourcemap: 'external',
    minify: false,
    splitting: false,
    external: [],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });

  if (!result.success) {
    console.error('ESM build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}

async function buildCJS(): Promise<void> {
  console.log('Building CJS...');
  const result = await Bun.build({
    entrypoints: [ENTRYPOINT],
    outdir: DIST,
    format: 'cjs',
    target: 'bun',
    sourcemap: 'external',
    minify: false,
    splitting: false,
    external: [],
    naming: '[dir]/[name].cjs',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });

  if (!result.success) {
    console.error('CJS build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}

async function buildDeclarations(): Promise<void> {
  console.log('Generating TypeScript declarations...');
  const result = await $`bunx tsc -p tsconfig.build.json`.quiet();

  if (result.exitCode !== 0) {
    console.error('Declaration generation failed:');
    console.error(result.stderr.toString());
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log('Building event-emission...\n');

  await clean();

  // Build ESM and CJS in parallel
  await Promise.all([buildESM(), buildCJS()]);

  // Generate declarations (must be after builds complete)
  await buildDeclarations();

  console.log('\nBuild complete!');
  console.log('  - dist/index.js (ESM)');
  console.log('  - dist/index.cjs (CJS)');
  console.log('  - dist/index.d.ts (TypeScript declarations)');
}

main().catch((error: unknown) => {
  console.error('Build failed:', error);
  process.exit(1);
});
