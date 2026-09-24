// Сборка: esbuild -> game.js (один файл для Яндекс Игр), опционально zip-архив
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const wantZip = process.argv.includes('--zip');

const releaseDir = path.join(root, 'release');

await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: !dev,
  sourcemap: dev,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(root, 'game.js'),
  logLevel: 'info',
});

if (wantZip) {
  // release/ — готовая папка для консоли разработчика Яндекс Игр
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });
  for (const f of ['index.html', 'styles.css', 'game.js']) {
    copyFileSync(path.join(root, f), path.join(releaseDir, f));
  }
  const zipPath = path.join(root, 'voxelcraft-yandex.zip');
  rmSync(zipPath, { force: true });
  try {
    execFileSync('zip', ['-q', '-r', zipPath, 'index.html', 'styles.css', 'game.js'], { cwd: releaseDir });
  } catch (e) {
    // zip может отсутствовать — используем python3
    execFileSync('python3', ['-m', 'zipfile', '-c', zipPath,
      path.join(releaseDir, 'index.html'),
      path.join(releaseDir, 'styles.css'),
      path.join(releaseDir, 'game.js')]);
  }
  console.log('Готово:', zipPath, existsSync(zipPath) ? '' : '(ошибка)');
}
