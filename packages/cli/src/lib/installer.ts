import { existsSync } from 'node:fs';
import { readFile, cp, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Dress, ParamDef, ResolvedDress } from '@clawset/core';

export interface InstallResult {
  dress: Dress<Record<string, ParamDef>>;
  packageDir: string;
  packageName: string;
}

/**
 * Load a dress from a local directory (npm/git install via pacote deferred to v2).
 *
 * For now, supports:
 * - Local directory path (./my-dress or /absolute/path)
 * - Workspace package name (@clawset/dress-fitness-coach)
 */
export async function installDress(
  specifier: string,
  targetDir: string,
): Promise<InstallResult> {
  let sourceDir: string;
  let packageName: string;

  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    // Local path
    sourceDir = resolve(specifier);
    if (!existsSync(sourceDir)) {
      throw new Error(`Dress directory not found: ${sourceDir}`);
    }
    const pkgPath = join(sourceDir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      packageName = pkg.name ?? specifier;
    } else {
      packageName = specifier;
    }
  } else {
    // Try to resolve as a node module
    try {
      const resolved = import.meta.resolve(specifier);
      sourceDir = dirname(new URL(resolved).pathname);
      packageName = specifier;
    } catch {
      throw new Error(
        `Could not resolve dress "${specifier}".\n` +
        `Try installing it first: pnpm add ${specifier}\n` +
        `Or provide a local path: clawset dress ./path/to/dress`,
      );
    }
  }

  // Determine where the built dress module lives
  let dressModulePath: string;
  const pkgPath = join(sourceDir, 'package.json');

  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    const exportsEntry = pkg.exports?.['.'];
    const mainEntry =
      typeof exportsEntry === 'string'
        ? exportsEntry
        : exportsEntry?.import ?? pkg.main ?? 'dist/index.js';
    dressModulePath = join(sourceDir, mainEntry);
  } else {
    dressModulePath = join(sourceDir, 'dist', 'index.js');
  }

  if (!existsSync(dressModulePath)) {
    throw new Error(
      `Dress module not found at ${dressModulePath}.\n` +
      `Make sure the dress is built: cd ${sourceDir} && pnpm build`,
    );
  }

  // Dynamic import to load the dress
  const moduleUrl = pathToFileURL(dressModulePath).href;
  const mod = await import(moduleUrl);
  const dress = (mod.default?.default ?? mod.default) as Dress<Record<string, ParamDef>>;

  if (!dress || typeof dress.resolve !== 'function') {
    throw new Error(
      `Invalid dress module at ${dressModulePath}.\n` +
      `The default export must be created with defineDress().`,
    );
  }

  // Copy dress assets to target directory
  const dressId = dress._input.id;
  const dressDir = join(targetDir, dressId);
  await mkdir(dressDir, { recursive: true });

  // Copy guide file if specified
  if (dress._input.files?.guide) {
    const guideSrc = join(sourceDir, dress._input.files.guide);
    if (existsSync(guideSrc)) {
      await cp(guideSrc, join(dressDir, 'GUIDE.md'));
    }
  }

  // Copy template files
  for (const template of dress._input.files?.templates ?? []) {
    const tmplSrc = join(sourceDir, template);
    if (existsSync(tmplSrc)) {
      const tmplName = template.split('/').pop()!;
      await cp(tmplSrc, join(dressDir, tmplName));
    }
  }

  return { dress, packageDir: sourceDir, packageName };
}

/**
 * Resolve a dress with given params, returning the validated definition.
 */
export function resolveDress(
  dress: Dress<Record<string, ParamDef>>,
  params: Record<string, unknown>,
): ResolvedDress {
  return dress.resolve(params as never);
}
