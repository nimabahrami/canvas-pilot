// Local, certificate-signed DMG. Developer ID notarization remains a release step.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localSigning } from './local-signing.mjs';

if (process.platform !== 'darwin') throw new Error('Build the Mac DMG on macOS.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Invalid package version.');
const bundle = path.join(root, 'release/CanvasPilot.app');
const output = path.join(root, `release/CanvasPilot-${version}-${process.arch}.dmg`);
const temporary = output.replace(/\.dmg$/, '.building.dmg');
const stage = await mkdtemp(path.join(tmpdir(), 'canvaspilot-dmg-'));
const run = (bin, args) => execFileSync(bin, args, { stdio: 'inherit' });
try {
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  run('/usr/bin/ditto', [bundle, path.join(stage, 'CanvasPilot.app')]);
  await symlink('/Applications', path.join(stage, 'Applications'));
  run('/usr/bin/hdiutil', ['create', '-volname', 'CanvasPilot', '-srcfolder', stage, '-format', 'UDZO', '-ov', temporary]);
  const identity = await localSigning(root);
  run('/usr/bin/codesign', ['--force', '--sign', identity.fingerprint, '--keychain', identity.keychain, temporary]);
  run('/usr/bin/codesign', ['--verify', '--strict', temporary]);
  run('/usr/bin/hdiutil', ['verify', temporary]);
  await rename(temporary, output);
  console.log(`Local DMG: ${output}`);
} finally {
  await rm(stage, { recursive: true, force: true });
  await rm(temporary, { force: true });
}
