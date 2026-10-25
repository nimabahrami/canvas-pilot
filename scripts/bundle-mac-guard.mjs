import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Replacing a live signed app can leave macOS evaluating cached code identities.
export function assertAppStopped(bundle, probe = spawnSync) {
  const executable = path.join(bundle, 'Contents/MacOS/CanvasPilot');
  const pattern = `^${executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`;
  const result = probe('/usr/bin/pgrep', ['-f', pattern], { encoding: 'utf8' });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Cannot check whether CanvasPilot is running. The installed app was not replaced.');
  if (result.status === 0) throw new Error('Quit CanvasPilot with Cmd+Q before bundling. The installed app was not replaced.');
}
