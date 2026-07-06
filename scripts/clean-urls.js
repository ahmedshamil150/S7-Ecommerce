import { readdirSync, renameSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';

const dist = join(import.meta.dirname, '..', 'dist');
const exclude = new Set(['index.html', '404.html']);
const isGoogleVerify = (name) => name.startsWith('google') && name.endsWith('.html');
const handled = new Set();

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.html') && !exclude.has(entry.name) && !isGoogleVerify(entry.name) && !handled.has(full)) {
      handled.add(full);
      const dirPath = full.replace(/\.html$/, '');
      mkdirSync(dirPath, { recursive: true });
      const dest = join(dirPath, 'index.html');
      if (existsSync(dest)) rmSync(dest);
      renameSync(full, dest);
      console.log(`  ${full.replace(dist + '\\', '')} → ${dirPath.replace(dist + '\\', '')}/index.html`);
    }
  }
}

console.log('Restructuring HTML files for clean URLs...');
walk(dist);
console.log('Done.');
