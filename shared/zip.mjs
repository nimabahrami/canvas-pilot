// A small ZIP writer using the standard STORE method. PNGs are already compressed.
const table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) { let crc = -1; for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]; return (crc ^ -1) >>> 0; }
export function createZip(files) {
  if (files.length > 65535) throw new Error('This archive has too many files. Export a smaller session.');
  const names = new Set();
  const encoder = new TextEncoder(), chunks = [], directory = [];
  let offset = 0;
  for (const file of files) {
    if (typeof file.name !== 'string' || !file.name || file.name.includes('\\') || file.name.includes(':') || file.name.includes('\0') || file.name.split('/').some(part => !part || part === '.' || part === '..') || names.has(file.name)) throw new Error('Invalid or duplicate archive filename.');
    names.add(file.name);
    const name = encoder.encode(file.name), data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);
    if (name.length > 65535 || offset + data.length + name.length + 30 > 0xffffffff) throw new Error('This archive is too large. Export a smaller session.');
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, name.length, true); header.set(name, 30);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
    chunks.push(header, data); directory.push(central); offset += header.length + data.length;
  }
  const directorySize = directory.reduce((sum, block) => sum + block.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + end.length);
  let position = 0; for (const chunk of [...chunks, ...directory, end]) { result.set(chunk, position); position += chunk.length; }
  return result;
}
