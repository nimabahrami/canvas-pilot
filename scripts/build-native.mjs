import { execFileSync } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
if (process.platform === 'darwin') {
  const source = fileURLToPath(new URL('../electron/native/window-context.m', import.meta.url));
  const target = fileURLToPath(new URL('../electron/bin/window-context', import.meta.url));
  const output = await stat(target).catch(() => null);
  if (!output || output.mtimeMs < (await stat(source)).mtimeMs) {
    await mkdir(fileURLToPath(new URL('../electron/bin', import.meta.url)), { recursive: true });
    execFileSync('/usr/bin/xcrun', ['clang', '-O2', '-fobjc-arc', '-framework', 'AppKit', '-framework', 'CoreGraphics', source, '-o', target], { stdio: 'inherit' });
  }
}
