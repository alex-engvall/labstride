import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const origin = 'https://docs.labstride.dev';
const routes = ['/', '/getting-started/project-status/', '/concepts/architecture/', '/reference/specifications/', '/contributing/'];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat();
}

async function destination(pathname) {
  let path = resolve(root, `.${decodeURIComponent(pathname)}`);
  assert(path === root || path.startsWith(`${root}${sep}`), `Link escapes output: ${pathname}`);
  if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
  assert((await stat(path)).isFile(), `Missing output file: ${pathname}`);
  return path;
}

const files = await walk(root);
const pages = new Map(await Promise.all(files.filter((file) => file.endsWith('.html')).map(async (file) => [file, await readFile(file, 'utf8')])));
for (const route of routes) {
  const html = pages.get(await destination(route));
  assert(html?.includes(`rel="canonical" href="${origin}${route}"`) || html?.includes(`href="${origin}${route}" rel="canonical"`), `Incorrect canonical URL: ${route}`);
}
assert.equal((await readFile(join(root, 'CNAME'), 'utf8')).trim(), 'docs.labstride.dev');
await destination('/pagefind/pagefind.js');
await destination('/sitemap-index.xml');

let checked = 0;
for (const [file, html] of pages) {
  const relative = file.slice(root.length).split(sep).join('/');
  const base = new URL(relative.endsWith('/index.html') ? relative.slice(0, -10) : relative, origin);
  for (const match of html.matchAll(/\b(?:href|src)="([^"<>]+)"/g)) {
    const target = new URL(match[1].replaceAll('&amp;', '&'), base);
    if (target.origin !== origin) continue;
    const path = await destination(target.pathname);
    if (target.hash && pages.has(path)) {
      const ids = new Set([...pages.get(path).matchAll(/\bid="([^"<>]+)"/g)].map((id) => id[1]));
      assert(ids.has(decodeURIComponent(target.hash.slice(1))), `Missing anchor: ${match[1]} in ${relative}`);
    }
    checked++;
  }
}
console.log(`PASS: ${routes.length} documentation routes, ${checked} local links/assets, canonical URLs, sitemap and local search index.`);
