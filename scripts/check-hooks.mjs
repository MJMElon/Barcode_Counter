#!/usr/bin/env node
/**
 * Refuse to build when a hook is called that nothing brought into the file.
 *
 * `useEffect is not defined` shipped to phones once. Vite does not stop it:
 * a bare identifier is legal JavaScript, so the bundler happily emits
 * `useEffect(...)` and the ReferenceError only happens when a Field Conductor
 * opens the screen. It cost a broken PALMS tab in production, and the fix was
 * one word on an import line.
 *
 * A merge is how it got in — one side edited the import, the other edited the
 * body, and git took one of each without conflicting. That will happen again,
 * so this runs on every build rather than relying on anyone remembering.
 *
 * The rule: every `useSomething(` in a source file must be imported into that
 * file, declared in it, or reached through an object (`React.useEffect`).
 * Deliberately narrow — hooks only — so it stays fast and never argues about
 * anything else.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/* Comments and strings hold examples and prose — "see useEffect above" is not
   a call. Blanking them keeps this from failing a build over a sentence. */
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

const problems = [];

for (const file of sourceFiles(SRC)) {
  const raw = readFileSync(file, 'utf8');
  const code = stripNonCode(raw);

  // Anything the file was given or made for itself.
  const known = new Set();
  for (const m of code.matchAll(/import\s+(?:([\w$]+)\s*,\s*)?\{([^}]*)\}\s*from/g)) {
    if (m[1]) known.add(m[1]);
    for (const part of m[2].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) known.add(name);
    }
  }
  for (const m of code.matchAll(/import\s+([\w$]+)\s+from/g)) known.add(m[1]);
  for (const m of code.matchAll(/import\s*\*\s*as\s+([\w$]+)\s+from/g)) known.add(m[1]);
  for (const m of code.matchAll(/(?:function|const|let|var)\s+(use[A-Z][\w$]*)/g)) known.add(m[1]);

  // Called, and not reached through an object.
  for (const m of code.matchAll(/(^|[^\w$.])(use[A-Z][\w$]*)\s*\(/g)) {
    const name = m[2];
    if (known.has(name)) continue;
    const line = code.slice(0, m.index).split('\n').length;
    problems.push({ file: relative(ROOT, file), line, name });
  }
}

if (problems.length) {
  console.error('\n  Hook called but never imported — this would crash the screen at runtime:\n');
  for (const p of problems) console.error(`    ${p.file}:${p.line}  ${p.name}()`);
  console.error('\n  Add it to the import at the top of the file, then build again.\n');
  process.exit(1);
}
