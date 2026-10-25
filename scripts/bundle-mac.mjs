// Local development bundle using the installed Electron runtime. This is not
// a notarized distribution build; release installers still use Electron Builder.
import { cp, mkdir, rm, writeFile, readFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { localSigning } from './local-signing.mjs';
import { assertAppStopped } from './bundle-mac-guard.mjs';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('This local bundle script is for macOS.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'release/CanvasPilot.app');
const staging = path.join(root, 'release/CanvasPilot-staging.app');
const run = (bin, args) => execFileSync(bin, args, { stdio: 'inherit' });
assertAppStopped(output);
await mkdir(path.dirname(output), { recursive: true });
await rm(staging, { recursive: true, force: true });
run('/usr/bin/ditto', [path.join(root, 'node_modules/electron/dist/Electron.app'), staging]);
await rename(path.join(staging, 'Contents/MacOS/Electron'), path.join(staging, 'Contents/MacOS/CanvasPilot'));
const resources = path.join(staging, 'Contents/Resources');
await cp(path.join(root, 'build/icon.icns'), path.join(resources, 'canvaspilot.icns'));
await rm(path.join(resources, 'default_app.asar'), { force: true });
const appDir = path.join(resources, 'app');
await mkdir(appDir, { recursive: true });
for (const name of ['dist', 'electron', 'shared', 'LICENSES', 'LICENSE']) await cp(path.join(root, name), path.join(appDir, name), { recursive: true });
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(appDir, 'package.json'), JSON.stringify({ name: pkg.name, productName: 'CanvasPilot', version: pkg.version, main: pkg.main, type: 'module' }));
const plist = path.join(staging, 'Contents/Info.plist');
run('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconFile canvaspilot.icns', plist]);
for (const [key, value] of Object.entries({ CFBundleName: 'CanvasPilot', CFBundleDisplayName: 'CanvasPilot', CFBundleExecutable: 'CanvasPilot', CFBundleIdentifier: 'app.canvaspilot.desktop', CFBundleVersion: pkg.version, CFBundleShortVersionString: pkg.version, LSApplicationCategoryType: 'public.app-category.productivity' })) run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
run('/usr/libexec/PlistBuddy', ['-c', 'Delete :ElectronAsarIntegrity', plist]);
run('/usr/libexec/PlistBuddy', ['-c', 'Add :NSScreenCaptureUsageDescription string Capture only the window area you select for your local screenshot journal.', plist]);
const identity = await localSigning(root);
run('/usr/bin/codesign', ['--force', '--deep', '--sign', identity.fingerprint, '--keychain', identity.keychain, '--identifier', 'app.canvaspilot.desktop', '--requirements', `=designated => certificate leaf = H"${identity.fingerprint}" and identifier "app.canvaspilot.desktop"`, staging]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staging]);
assertAppStopped(output);
await rm(output, { recursive: true, force: true });
await rename(staging, output);
console.log(`Local app: ${output}`);
