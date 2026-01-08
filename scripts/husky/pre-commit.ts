#!/usr/bin/env bun
import { $ } from 'bun';

import {
  error,
  getStagedFiles,
  header,
  info,
  isContinuousIntegration,
  success,
  warning,
} from './utilities.ts';

const DEPENDENCY_KEYS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
  'overrides',
  'resolutions',
];

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = normalizeJson(obj[key]);
    }
    return sorted;
  }
  return value;
}

function extractDependencyFields(pkg: Record<string, unknown>): Record<string, unknown> {
  const deps: Record<string, unknown> = {};
  for (const key of DEPENDENCY_KEYS) {
    if (key in pkg) deps[key] = pkg[key];
  }
  return deps;
}

async function loadJsonFromGit(
  ref: string,
  file: string,
): Promise<Record<string, unknown> | null> {
  try {
    const text = await $`git show ${ref}:${file}`.text();
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function stagedDependenciesChanged(): Promise<boolean> {
  const stagedPackage = await loadJsonFromGit(':', 'package.json');
  if (!stagedPackage) return false;
  const headPackage = (await loadJsonFromGit('HEAD', 'package.json')) ?? {};

  const stagedDeps = JSON.stringify(
    normalizeJson(extractDependencyFields(stagedPackage)),
  );
  const headDeps = JSON.stringify(normalizeJson(extractDependencyFields(headPackage)));

  return stagedDeps !== headDeps;
}

if (isContinuousIntegration()) {
  info('Skipping hook in CI');
  process.exit(0);
}

header('Pre-commit checks');
let ok = true;

// 1) package/lock checks
let staged = await getStagedFiles();
if (staged.includes('package.json')) {
  info('package.json is staged');
  const depsChanged = await stagedDependenciesChanged();
  if (!depsChanged) {
    info('No dependency changes detected; skipping bun.lock check');
  } else if (!staged.includes('bun.lock')) {
    warning('bun.lock is not staged');
    info('Dependencies changed; updating lockfile...');
    try {
      await $`bun install`;
      const lockDiff = await $`git diff --name-only -- bun.lock`.text();
      if (lockDiff.trim().length > 0) {
        await $`git add bun.lock`;
        success('bun.lock staged');
      }
    } catch {
      warning('bun install failed; run it manually');
      ok = false;
    }
    staged = await getStagedFiles();
    const lockDiff = await $`git diff --name-only -- bun.lock`.text();
    if (lockDiff.trim().length > 0 && !staged.includes('bun.lock')) {
      warning('bun.lock is not staged');
      ok = false;
    }
  } else {
    info('Dependencies changed, installing…');
    try {
      await $`bun install`;
      success('Dependencies installed');
    } catch {
      warning('bun install failed; run it manually');
    }
  }
}

// 2) lint:fix
info('Running lint:fix…');
try {
  await $`bun run lint:fix`;
  success('lint:fix passed');
} catch {
  error('lint:fix failed');
  ok = false;
}

// 3) typecheck
info('Running typecheck…');
try {
  await $`bun run typecheck`;
  success('typecheck passed');
} catch {
  error('typecheck failed');
  ok = false;
}

// 4) test
info('Running test…');
try {
  await $`bun run test`;
  success('test passed');
} catch {
  error('test failed');
  ok = false;
}

// 5) lint-staged (format staged files; always last)
info('Running lint-staged…');
try {
  await $`bun exec lint-staged`;
  success('Lint-staged passed');
} catch {
  error('Lint-staged failed');
  ok = false;
}

if (!ok) {
  error('Pre-commit checks failed');
  process.exit(1);
}

success('All pre-commit checks passed');

process.exit(0);
