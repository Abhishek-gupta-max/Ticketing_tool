// Vercel build for the frontend. Works whether the Vercel project's Root
// Directory is the repository root, "frontend" or "backend": the site is
// always built from ./frontend (next to this file) into <current dir>/dist,
// which is the outputDirectory in vercel.json.
//
// This is an npm workspace with one lock file at the repository root. When
// Vercel runs "npm install" inside a workspace folder (Root Directory
// "backend"), npm installs only that workspace's dependencies, so the
// frontend's (react, @vitejs/plugin-react...) are missing. In that case the
// whole workspace is installed from the repository root first, as pinned by
// package-lock.json.
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(root, 'frontend');
const require = createRequire(path.join(frontend, 'package.json'));

function missingPackages() {
  const pkg = JSON.parse(readFileSync(path.join(frontend, 'package.json'), 'utf8'));
  // Vite itself is not checked here: it is resolved once, after any install, so
  // Node's resolution cache cannot hand back a copy installed for another workspace.
  const needed = [...Object.keys(pkg.dependencies ?? {}), '@vitejs/plugin-react'];
  return needed.filter((name) => {
    try {
      require.resolve(`${name}/package.json`);
      return false;
    } catch (error) {
      // ERR_PACKAGE_PATH_NOT_EXPORTED: installed, but its exports hide package.json
      return error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED';
    }
  });
}

function run(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const missing = missingPackages();
if (missing.length) {
  console.log(`Frontend packages not installed (${missing.join(', ')}); installing all workspaces in ${root}`);
  run('npm', ['install', '--workspaces', '--include-workspace-root', '--include=dev', '--no-audit', '--no-fund'], root, process.platform === 'win32');
}

// Use the Vite version the frontend depends on, wherever npm installed it.
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const outDir = path.join(process.cwd(), 'dist');

console.log(`Building ${frontend} with ${vite} into ${outDir}`);
run(process.execPath, [vite, 'build', frontend, '--outDir', outDir, '--emptyOutDir'], process.cwd());
