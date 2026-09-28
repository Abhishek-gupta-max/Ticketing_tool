// Vercel build for the frontend. Works whether the Vercel project's Root
// Directory is the repository root, "frontend" or "backend": the site is
// always built from ./frontend (next to this file) into <current dir>/dist,
// which is the outputDirectory in vercel.json.
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frontend');
const require = createRequire(path.join(frontend, 'package.json'));
// Use the Vite version the frontend depends on, wherever npm installed it.
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const outDir = path.join(process.cwd(), 'dist');

console.log(`Building ${frontend} with ${vite} into ${outDir}`);
const result = spawnSync(process.execPath, [vite, 'build', frontend, '--outDir', outDir, '--emptyOutDir'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
