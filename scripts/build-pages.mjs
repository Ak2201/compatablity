// Builds the GitHub Pages artifact from public/ into dist/.
//
// Every relative reference in dist/**/*.js and dist/index.html gets a shared
// cache-busting query, ?v=<hash>, where <hash> is the first 10 hex chars of a
// SHA-256 over the whole public/ tree. One version per deploy means old and new
// modules are never mixed, and browsers fetch fresh copies after each deploy.
//
// Usage: node scripts/build-pages.mjs   (Node 20+, no dependencies)

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');

// Relative specifiers only: ./x, ../x. Absolute URLs, root-absolute paths,
// bare specifiers and anything already carrying a query or fragment are skipped.
const REL = String.raw`(\.{1,2}\/[^'"\`?#\s]+)`;
const JS_PATTERNS = [
  // import x from './a.js', export {y} from './a.js', export * from './a.js'
  new RegExp(String.raw`(\b(?:import|export)\b[^;'"\`]*?\bfrom\s*)(['"])${REL}\2`, 'g'),
  // import './side-effect.js'
  new RegExp(String.raw`(\bimport\s*)(['"])${REL}\2`, 'g'),
  // import('./lazy.js')
  new RegExp(String.raw`(\bimport\s*\(\s*)(['"])${REL}\2`, 'g'),
];
const HTML_TAG = /<(script|link)\b[^>]*>/gi;
const HTML_ATTR = /(\s(?:src|href)\s*=\s*)(["'])([^"'?#]+)\2/gi;
const NON_RELATIVE = /^([a-z][a-z0-9+.-]*:|\/|#)/i;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

const toPosix = (p) => p.split(sep).join('/');

async function computeVersion(files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(toPosix(relative(SRC, file)) + '\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 10);
}

function rewriteJs(source, version, relFile, known) {
  let count = 0;
  let out = source;
  for (const re of JS_PATTERNS) {
    out = out.replace(re, (match, pre, quote, spec) => {
      const target = posix.normalize(posix.join(posix.dirname(relFile), spec));
      if (!known.has(target)) {
        throw new Error(`${relFile}: import "${spec}" does not resolve to a file in public/`);
      }
      count++;
      return `${pre}${quote}${spec}?v=${version}${quote}`;
    });
  }
  return { text: out, count };
}

function rewriteHtml(source, version) {
  let count = 0;
  const text = source.replace(HTML_TAG, (tag) =>
    tag.replace(HTML_ATTR, (match, pre, quote, value) => {
      if (NON_RELATIVE.test(value)) return match;
      count++;
      return `${pre}${quote}${value}?v=${version}${quote}`;
    }),
  );
  return { text, count };
}

async function main() {
  await stat(SRC).catch(() => {
    throw new Error(`source folder not found: ${SRC}`);
  });

  const sourceFiles = await walk(SRC);
  if (sourceFiles.length === 0) throw new Error(`no files in ${SRC}`);
  const known = new Set(sourceFiles.map((f) => toPosix(relative(SRC, f))));

  const version = await computeVersion(sourceFiles);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(SRC, DIST, { recursive: true });

  let rewritten = 0;
  let refs = 0;
  for (const file of await walk(DIST)) {
    const rel = toPosix(relative(DIST, file));
    const isJs = rel.endsWith('.js');
    const isHtml = rel === 'index.html';
    if (!isJs && !isHtml) continue;

    const source = await readFile(file, 'utf8');
    const result = isJs
      ? rewriteJs(source, version, rel, known)
      : rewriteHtml(source, version);
    if (result.text !== source) {
      await writeFile(file, result.text, 'utf8');
      rewritten++;
    }
    refs += result.count;
  }

  const written = (await walk(DIST)).length;
  console.log(`version: ${version}`);
  console.log(`files written to dist/: ${written} (${rewritten} rewritten, ${refs} versioned references)`);
}

main().catch((err) => {
  console.error(`build-pages failed: ${err.message}`);
  process.exitCode = 1;
});
