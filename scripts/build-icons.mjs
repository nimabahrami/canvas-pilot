// Package the approved white-on-black icon for each desktop platform.
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') process.exit(0);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(tmpdir(), 'canvaspilot-icons-'));
try {
  const iconset = path.join(temp, 'CanvasPilot.iconset');
  await mkdir(iconset); await mkdir(path.join(root, 'build'), { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
    execFileSync('/usr/bin/sips', ['-z', String(size * scale), String(size * scale), path.join(root, 'public/app-icon.png'), '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)], { stdio: 'ignore' });
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build/icon.icns')]);
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const icons = path.join(root, 'build/icons'); await mkdir(icons, { recursive: true });
  const images = [];
  for (const size of [...sizes, 512]) {
    const file = path.join(icons, `${size}x${size}.png`);
    execFileSync('/usr/bin/sips', ['-z', String(size), String(size), path.join(root, 'public/app-icon.png'), '--out', file], { stdio: 'ignore' });
    if (size <= 256) images.push(await readFile(file));
  }
  // Modern Windows ICO supports PNG entries; supply each common DPI size.
  const header = Buffer.alloc(6 + images.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (let i = 0; i < images.length; i++) {
    const entry = 6 + i * 16, png = images[i], size = sizes[i];
    if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error('Incorrect icon dimensions.');
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += png.length;
  }
  await writeFile(path.join(root, 'build/icon.ico'), Buffer.concat([header, ...images]));
  if (!(await readFile(path.join(root, 'build/icon.icns'))).subarray(0, 4).equals(Buffer.from('icns'))) throw new Error('Invalid macOS icon.');
  console.log('App icons built from public/app-icon.png');
} finally { await rm(temp, { recursive: true, force: true }); }
