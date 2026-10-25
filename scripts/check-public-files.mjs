// Check what a normal git add would include, without creating a repo in the workspace.
import { execFileSync } from 'node:child_process';
import { access, lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let temporary;
try {
  const existing = await access(path.join(root, '.git')).then(() => true, () => false);
  let args = ['-C', root];
  if (!existing) {
    temporary = await mkdtemp(path.join(tmpdir(), 'canvaspilot-public-check-'));
    execFileSync('git', ['init', '--quiet', temporary]);
    args = [`--git-dir=${path.join(temporary, '.git')}`, `--work-tree=${root}`];
  }
  const files = [...new Set(execFileSync('git', [...args, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
  const problems = [];
  const privateFiles = new Set([
    'scripts/capture-promo.mjs', 'LICENSES/Ponytail-MIT.txt',
    ...['SKILLS', 'BRAND-ASSETS', 'PRODUCT-SPEC', 'TECHNICAL-SPEC', 'TEST-PLAN', 'CODEBASE-AUDIT', 'STATUS'].map(name => `docs/${name}.md`),
  ]);
  for (const file of files) {
    if (privateFiles.has(file) || /(^|\/)(AGENTS(?:\.override)?\.md|CLAUDE\.md|GEMINI\.md|SKILL\.md|\.local-signing|\.local-tools|\.agents|\.codex|\.claude|\.cursor|\.idea|\.vscode|\.aws|\.ssh|\.auth|\.cache|skills|tests|playwright|node_modules|dist|release|output|coverage|sessions|library|screenshots|test-results|playwright-report|\.npmrc|\.netrc|\.envrc)(\/|$)|(?:^|\/)playwright\.config\.|\.(?:pem|key|p8|p12|pfx|keystore|keychain|keychain-db|mobileprovision)$/.test(file) || /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')) problems.push(`${file}: private/generated file is included`);
    if (!(await lstat(path.join(root, file))).isFile()) { problems.push(`${file}: not a regular file`); continue; }
    const bytes = await readFile(path.join(root, file));
    const text = bytes.toString('utf8');
    if (text.includes(homedir() + path.sep)) problems.push(`${file}: contains this machine's home path`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|nvapi-[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[0-9A-Z]{16})/.test(text)) problems.push(`${file}: possible credential (value withheld)`);
  }
  if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
  else console.log(`Checked ${files.length} public candidate files: no personal instruction files, signing keys, home paths, or recognized credential patterns found.`);
} finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
