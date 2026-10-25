const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const run = promisify(execFile);
module.exports.read = async function read(id) {
  if (process.platform !== 'darwin') return [];
  if (id && !/^window:\d+:\d+$/.test(id)) throw new Error('Invalid window identity.');
  const { stdout } = await run(path.join(__dirname, 'bin/window-context'), id ? [id.split(':')[1]] : [], { timeout: 3000, maxBuffer: 16384 });
  const value = JSON.parse(stdout);
  if (!Array.isArray(value) || value.some(item => !/^window:\d+:\d+$/.test(item.id) || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(item.bounds?.[key])) || item.bounds.width < 2 || item.bounds.height < 2)) throw new Error('The current window could not be identified.');
  return value;
};
