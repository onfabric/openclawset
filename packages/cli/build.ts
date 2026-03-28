import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertBuildSuccess,
  cleanDir,
  printBuildOutput,
  removeWorkspaceDependencies,
  setPackageJsonDependencies,
} from '@repo/pack-utils';
import pkg from './package.json';

const CURRENT_DIR = import.meta.dir;
const ROOT_LICENSE_PATH = join(CURRENT_DIR, '../..', 'LICENSE');
const ROOT_README_PATH = join(CURRENT_DIR, '../..', 'README.md');

const PKG_DIR = join(CURRENT_DIR, 'pkg');
const DIST_DIR = join(PKG_DIR, 'dist');
const LICENSE_DESTINATION_PATH = join(PKG_DIR, 'LICENSE');
const README_DESTINATION_PATH = join(PKG_DIR, 'README.md');

const PACKAGE_ENTRYPOINTS = ['./src/index.ts'];

console.log('🧹 Cleaning dist directory...');
await cleanDir({ dir: DIST_DIR });

console.log('🔨 Building plugin...');
const buildResult = await Bun.build({
  entrypoints: PACKAGE_ENTRYPOINTS,
  outdir: DIST_DIR,
  target: 'node',
  // Externalize declared runtime deps (oclif reads its own package.json and uses
  // require.resolve() internally, both of which break when bundled). Internal
  // #-alias imports and workspace packages are inlined by omitting them here.
  external: Object.keys(removeWorkspaceDependencies(pkg.dependencies ?? {})),
  minify: true,
});
assertBuildSuccess({ buildResult });
printBuildOutput({ buildResult });

console.log('📄 Copying license and readme...');
await copyFile(ROOT_LICENSE_PATH, LICENSE_DESTINATION_PATH);
await copyFile(ROOT_README_PATH, README_DESTINATION_PATH);

console.log('🔄 Updating package.json...');
const internalPackageJsonPath = join(CURRENT_DIR, 'package.json');
const publicPackageJsonPath = join(PKG_DIR, 'package.json');
await setPackageJsonDependencies({
  sourcePackageJsonPath: internalPackageJsonPath,
  targetPackageJsonPath: publicPackageJsonPath,
});

console.log('✅ Done');
