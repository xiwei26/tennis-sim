import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const publicDir = resolve('public');
const worker = resolve('sites-worker.js');

if (!existsSync(publicDir) || !existsSync(worker)) {
  throw new Error('Sites build requires public/ and sites-worker.js.');
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, 'server'), { recursive: true });
cpSync(publicDir, dist, { recursive: true });
cpSync(worker, resolve(dist, 'server', 'index.js'));
