function decodePng(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 40 * 1024 * 1024) throw new Error('Invalid screenshot. Use a PNG smaller than 30 MB.');
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Screenshot must be a PNG.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width * height > 100000000) throw new Error('Screenshot is too large.');
  return { bytes, width, height };
}
function validateEditState(state, width, height, flattened) {
  if (!state) return undefined;
  const base = decodePng(state.baseDataUrl);
  if (base.width !== width || base.height !== height || !Array.isArray(state.marks) || state.marks.length > 3000) throw new Error('Invalid editable screenshot.');
  let points = 0;
  for (const mark of state.marks) {
    if (!mark || !['arrow','rectangle','ellipse','pen','highlight','text','redact'].includes(mark.tool) || !/^#[a-fA-F0-9]{6}$/.test(mark.color) || !Number.isFinite(mark.width) || mark.width < 1 || mark.width > 100 || !Array.isArray(mark.points) || !mark.points.length) throw new Error('Invalid annotation.');
    points += mark.points.length;
    if (points > 100000 || mark.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > width || p.y < 0 || p.y > height) || (mark.text !== undefined && (typeof mark.text !== 'string' || mark.text.length > 20000)) || (mark.fontSize !== undefined && (!Number.isFinite(mark.fontSize) || mark.fontSize < 1 || mark.fontSize > 500))) throw new Error('Invalid annotation.');
  }
  if (state.marks.some(mark => mark.tool === 'redact')) {
    if (!flattened) throw new Error('A redacted screenshot must include its final pixels.');
    return { baseDataUrl: flattened, marks: [], sealed: true };
  }
  return { baseDataUrl: state.baseDataUrl, marks: state.marks, ...(state.sealed === true ? { sealed: true } : {}) };
}
module.exports = { decodePng, validateEditState };
