import fs from 'fs';
import path from 'path';

const roots = [
  path.join(process.cwd(), 'client', 'src'),
  path.join(process.cwd(), 'client', 'scripts'),
  path.join(process.cwd(), 'client', 'public'),
  path.join(process.cwd(), 'server'),
  path.join(process.cwd(), 'scripts'),
  path.join(process.cwd(), 'client', 'vite.shared.js'),
  path.join(process.cwd(), 'client', 'vite.config.js'),
  path.join(process.cwd(), 'client', 'vite.config.https.js'),
  path.join(process.cwd(), 'client', 'vite.plugins.tunnel.js'),
  path.join(process.cwd(), 'client', 'tailwind.config.js'),
  path.join(process.cwd(), 'client', 'postcss.config.js'),
];

const skipDirs = new Set(['node_modules', 'dist', '.git']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    if (/\.(js|jsx|mjs|cjs)$/.test(dir)) files.push(dir);
    return files;
  }
  for (const name of fs.readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    walk(path.join(dir, name), files);
  }
  return files;
}

function stripComments(code) {
  let out = '';
  let i = 0;
  let state = 'code';
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block';
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        state = ch;
        out += ch;
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    if (state === 'line') {
      if (ch === '\n') {
        out += '\n';
        state = 'code';
      }
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (state === '"' || state === "'") {
      out += ch;
      if (ch === '\\') {
        out += next || '';
        i += 2;
        continue;
      }
      if (ch === state) state = 'code';
      i += 1;
      continue;
    }
    if (state === '`') {
      out += ch;
      if (ch === '\\') {
        out += next || '';
        i += 2;
        continue;
      }
      if (ch === '`') state = 'code';
      i += 1;
      continue;
    }
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

const allFiles = roots.flatMap((r) => walk(r));
let count = 0;
for (const file of allFiles) {
  const before = fs.readFileSync(file, 'utf8');
  const after = stripComments(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    count += 1;
  }
}
console.log(`Stripped comments in ${count} files (${allFiles.length} scanned)`);
