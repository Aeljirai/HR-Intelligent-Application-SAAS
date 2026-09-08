#!/usr/bin/env node
/**
 * Zero-dependency import/export sanity checker. Not a real type checker
 * (that needs `bun install` on a machine with network access — see README),
 * but catches the class of bug a full TS compile would catch first: typo'd
 * import paths and named imports that don't exist in the target module.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../src');

function findAllFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findAllFiles(full, acc);
    else if (/\.(tsx?|d\.ts)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = findAllFiles(SRC);
let errors = 0;

function resolveImportPath(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // external package — not checked here
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'), base];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

function getExportedNames(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const names = new Set();
  for (const m of content.matchAll(/export\s+(?:default\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g)) {
    names.add(m[1]);
  }
  for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().replace(/^type\s+/, '').trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default/.test(content)) names.add('default');
  return names;
}

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const importRegex = /import\s+(?:type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*,?\s*(\{[^}]*\})?\s*from\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content))) {
    const [, first, second, spec] = match;
    const resolved = resolveImportPath(file, spec);
    if (spec.startsWith('.') || spec.startsWith('@/')) {
      if (!resolved) {
        console.log(`MISSING FILE  ${file.replace(SRC, 'src')}  ->  ${spec}`);
        errors++;
        continue;
      }
      const exported = getExportedNames(resolved);
      const namedBlock = [first, second].find((b) => b && b.startsWith('{'));
      if (namedBlock) {
        const names = namedBlock
          .replace(/[{}]/g, '')
          .split(',')
          .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        for (const name of names) {
          if (!exported.has(name)) {
            console.log(`MISSING EXPORT  ${file.replace(SRC, 'src')}  imports "${name}"  from  ${spec}  (resolved: ${resolved.replace(SRC, 'src')})`);
            errors++;
          }
        }
      }
    }
  }
}

console.log(errors === 0 ? `\nOK — checked ${files.length} files, no import/export mismatches found.` : `\n${errors} problem(s) found.`);
process.exit(errors === 0 ? 0 : 1);
