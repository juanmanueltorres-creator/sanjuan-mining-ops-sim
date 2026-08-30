import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOTS = ['src', 'public', 'docs'];
const EXTRA_FILES = ['README.md'];
const PATTERN = /safe|unsafe|road closed|real-time|live telemetry|operator route|verified route/gi;
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.yml', '.yaml']);

async function collectFiles(entry) {
  const info = await stat(entry);
  if (info.isFile()) return ALLOWED_EXTENSIONS.has(path.extname(entry)) || path.basename(entry) === 'README.md' ? [entry] : [];
  const children = await readdir(entry);
  const nested = await Promise.all(children.map((child) => collectFiles(path.join(entry, child))));
  return nested.flat();
}

const files = [
  ...(await Promise.all(ROOTS.map((root) => collectFiles(root)))).flat(),
  ...EXTRA_FILES,
];

const findings = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    PATTERN.lastIndex = 0;
    const matches = [...line.matchAll(PATTERN)];
    if (!matches.length) return;
    findings.push({
      file: file.split(path.sep).join('/'),
      line: index + 1,
      terms: [...new Set(matches.map((match) => match[0].toLowerCase()))],
      text: line.trim(),
    });
  });
}

console.log(`Claim audit: ${findings.length} matching lines require human review.`);
for (const finding of findings) {
  console.log(`${finding.file}:${finding.line} [${finding.terms.join(', ')}] ${finding.text}`);
}
console.log('Audit rule: every match must be negative/explanatory, a limitation, or directly backed by primary evidence. This command intentionally lists matches instead of suppressing them.');
