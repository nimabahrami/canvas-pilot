const fs = require('node:fs/promises');
const path = require('node:path');
const { decodePng, validateEditState } = require('./image-data.cjs');
const { randomUUID } = require('node:crypto');

async function containedPath(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Invalid session path.');
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (!stat) break;
    // A shared session must not redirect reads or writes outside its library.
    if (stat.isSymbolicLink()) throw new Error('Session files cannot be symbolic links.');
  }
  return file;
}

function validateSession(session) {
  const text = (value, limit) => typeof value === 'string' && value.length <= limit;
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value);
  const date = value => text(value, 64) && Number.isFinite(Date.parse(value));
  if (!session || !id(session.id) || !text(session.title, 120) || !date(session.createdAt) || !date(session.updatedAt) || !Array.isArray(session.entries)) throw new Error('Invalid session metadata.');
  const ids = new Set();
  for (const entry of session.entries) {
    if (!entry || !id(entry.id) || ids.has(entry.id) || !date(entry.createdAt) || !text(entry.prompt, 100000) || (entry.originalPrompt !== undefined && !text(entry.originalPrompt, 100000)) || !Array.isArray(entry.images) || entry.images.length > 12) throw new Error('Invalid journal entry.');
    ids.add(entry.id);
    for (const image of entry.images) {
      if (!image || !id(image.id) || ids.has(image.id) || !/^[a-zA-Z0-9-]{1,240}\.png$/.test(image.name) || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width * image.height > 100000000 || (image.revision !== undefined && (!Number.isSafeInteger(image.revision) || image.revision < 1))) throw new Error('Invalid screenshot metadata.');
      ids.add(image.id);
      const context = image.context;
      if (context && (!['window', 'screen', 'import'].includes(context.kind) || !text(context.title, 1000) || !date(context.capturedAt) || (context.url !== undefined && !text(context.url, 4000)))) throw new Error('Invalid screenshot context.');
    }
  }
}

async function atomicWrite(file, content) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp, content, { mode: 0o600 }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}

class SessionStore {
  constructor(root) { this.root = path.resolve(root); this.sessions = new Map(); this.queue = Promise.resolve(); }
  file(session, ...parts) { return containedPath(this.root, path.join(session.folder, ...parts)); }
  run(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
  load() { return this.run(async () => {
    const next = new Map();
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const folders = await fs.readdir(this.root, { withFileTypes: true });
    const sessions = [];
    for (const folder of folders) {
      if (!folder.isDirectory() || folder.name.startsWith('.')) continue;
      try {
        const location = path.join(this.root, folder.name);
        const file = await containedPath(this.root, path.join(location, 'session.json'));
        if ((await fs.stat(file)).size > 50 * 1024 * 1024) throw new Error('Session metadata is too large.');
        const session = JSON.parse(await fs.readFile(file, 'utf8'));
        validateSession(session);
        if (next.has(session.id)) throw new Error('Duplicate session identity.');
        session.folder = location;
        // Rebase saved paths when the user moves a whole session directory.
        for (const entry of session.entries) for (const image of entry.images) {
          image.path = await this.file(session, 'screenshots', image.name);
        }
        sessions.push(session); next.set(session.id, session);
      } catch (error) { console.warn(`Skipped unreadable session: ${folder.name}: ${error.message}`); }
    }
    this.sessions = next;
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }); }
  get(id) { const session = this.sessions.get(id); if (!session) throw new Error('Session not found.'); return session; }
  async persist(session) {
    const { serializeJournal, FORMATS } = await import('../shared/journal.mjs');
    const metadata = JSON.stringify(session, null, 2);
    if (Buffer.byteLength(metadata) > 50 * 1024 * 1024) throw new Error('This session is too large. Start another session; your draft is unchanged.');
    await fs.mkdir(await this.file(session, 'screenshots'), { recursive: true, mode: 0o700 });
    await atomicWrite(await this.file(session, 'session.json'), metadata);
    this.sessions.set(session.id, session);
    const failed = [];
    for (const format of FORMATS) {
      try { await atomicWrite(await this.file(session, `journal.${format}`), serializeJournal(session, format)); }
      catch { failed.push(format); }
    }
    return failed.length ? { ...session, exportWarning: `Entry saved, but journal.${failed.join('/')} could not be updated. Use Export to save another copy.` } : session;
  }
  append(payload) { return this.run(async () => {
    if (typeof payload.prompt !== 'string' || payload.prompt.length > 100000 || !Array.isArray(payload.images) || payload.images.length > 12) throw new Error('Invalid journal entry.');
    if (!payload.prompt.trim() && !payload.images.length) throw new Error('Add a prompt or screenshot first.');
    const { slugify, suggestTitle } = await import('../shared/journal.mjs');
    const now = new Date().toISOString();
    const id = randomUUID();
    const title = String(payload.title || suggestTitle(payload.prompt)).trim().slice(0, 120) || 'Untitled session';
    const session = payload.sessionId ? structuredClone(this.get(payload.sessionId)) : {
      id, title, createdAt: now, updatedAt: now,
      folder: path.join(this.root, `${now.slice(0, 10)}-${slugify(title)}-${id.slice(0, 8)}`), entries: [],
    };
    const entry = { id: randomUUID(), createdAt: now, prompt: payload.prompt.trim(), images: [] };
    if (payload.originalPrompt && payload.originalPrompt !== payload.prompt) entry.originalPrompt = String(payload.originalPrompt).slice(0, 100000);
    const images = payload.images.map(image => {
      const { bytes, width, height } = decodePng(image.dataUrl);
      const editState = validateEditState(image.editState, width, height, image.dataUrl);
      const context = image.context ? {
        kind: ['window', 'screen', 'import'].includes(image.context.kind) ? image.context.kind : 'import',
        title: String(image.context.title || 'Unknown source').slice(0, 1000),
        capturedAt: Number.isFinite(Date.parse(image.context.capturedAt)) ? image.context.capturedAt : now,
        ...(image.context.url ? { url: String(image.context.url).slice(0, 4000) } : {}),
      } : undefined;
      return { bytes, width, height, context, editState };
    });
    await fs.mkdir(await this.file(session, 'screenshots'), { recursive: true, mode: 0o700 });
    const written = [];
    try {
      for (const image of images) {
        const imageId = randomUUID();
        const name = `${String(session.entries.length + 1).padStart(3, '0')}-${slugify(image.context?.title || 'screenshot').slice(0, 45)}-${imageId.slice(0, 8)}.png`;
        const imagePath = await this.file(session, 'screenshots', name);
        await fs.writeFile(imagePath, image.bytes, { flag: 'wx', mode: 0o600 }); written.push(imagePath);
        if (image.editState) {
          const file = await containedPath(this.root, this.editFile(session, imageId, 1)); await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
          await atomicWrite(file, JSON.stringify(image.editState)); written.push(file);
        }
        entry.images.push({ revision: image.editState ? 1 : undefined, id: imageId, path: imagePath, name, width: image.width, height: image.height, context: image.context });
      }
      session.entries.push(entry); session.updatedAt = now;
      return await this.persist(session);
    } catch (error) {
      // If metadata committed, retain screenshots for recovery even if an export failed.
      const committed = await fs.readFile(path.join(session.folder, 'session.json'), 'utf8').then(text => JSON.parse(text).entries.some(e => e.id === entry.id)).catch(() => false);
      if (!committed) await Promise.all(written.map(file => fs.rm(file, { force: true })));
      throw error;
    }
  }); }
  rename(id, title) { return this.run(async () => {
    if (typeof title !== 'string' || !title.trim() || title.length > 120) throw new Error('Use a session title between 1 and 120 characters.');
    return this.persist({ ...this.get(id), title: title.trim(), updatedAt: new Date().toISOString() });
  }); }
  applyEnhancement(id, updatedAt, entries) { return this.run(async () => {
    const current = this.get(id);
    if (current.updatedAt !== updatedAt) throw new Error('This journal changed while you were reviewing it. Enhance it again to include the latest cards.');
    const { applyEnhancedEntries } = await import('../shared/journal.mjs');
    const next = entries === null
      ? { ...current, entries: current.entries.map(({ originalPrompt, ...entry }) => ({ ...entry, prompt: originalPrompt ?? entry.prompt })) }
      : applyEnhancedEntries(current, entries);
    return this.persist({ ...next, updatedAt: new Date().toISOString() });
  }); }
  removeEntry(id, entryId) { return this.run(async () => {
    const current = this.get(id);
    if (!current.entries.some(e => e.id === entryId)) throw new Error('Entry not found.');
    // Keep files on disk so previously copied paths remain valid.
    return this.persist({ ...current, entries: current.entries.filter(e => e.id !== entryId), updatedAt: new Date().toISOString() });
  }); }
  editFile(session, imageId, revision) {
    if (!/^[a-zA-Z0-9-]+$/.test(imageId) || !Number.isInteger(revision) || revision < 1) throw new Error('Invalid screenshot revision.');
    return path.join(session.folder, '.edits', `${imageId}-${revision}.json`);
  }
  async imageForEdit(id, imageId) {
    const session = this.get(id), image = session.entries.flatMap(e => e.images).find(i => i.id === imageId);
    if (!image) throw new Error('Screenshot not found.');
    const savedState = image.revision ? JSON.parse(await fs.readFile(await containedPath(this.root, this.editFile(session, imageId, image.revision)), 'utf8')) : undefined;
    const dataUrl = await this.image(id, imageId);
    return { ...image, dataUrl, editState: validateEditState(savedState, image.width, image.height, dataUrl) };
  }
  updateImage(id, imageId, input) { return this.run(async () => {
    const session = structuredClone(this.get(id)), image = session.entries.flatMap(e => e.images).find(i => i.id === imageId);
    if (!image) throw new Error('Screenshot not found.');
    const { bytes, width, height } = decodePng(input.dataUrl);
    const editState = validateEditState(input.editState, width, height, input.dataUrl);
    image.path = await this.file(session, 'screenshots', image.name);
    const previous = await fs.readFile(image.path), revision = (image.revision || 0) + 1;
    const editFile = await containedPath(this.root, this.editFile(session, imageId, revision));
    if (editState) { await fs.mkdir(path.dirname(editFile), { recursive: true }); await atomicWrite(editFile, JSON.stringify(editState)); }
    let result;
    try {
      await atomicWrite(image.path, bytes);
      image.width = width; image.height = height; image.revision = editState ? revision : undefined;
      session.updatedAt = new Date().toISOString();
      result = await this.persist(session);
    } catch (error) {
      await atomicWrite(image.path, previous);
      if (editState) await fs.rm(editFile, { force: true });
      throw error;
    }
    if (editState?.sealed) {
      // Saved redaction must not leave reversible copies in older edit revisions.
      try {
        const directory = await this.file(session, '.edits');
        for (const file of await fs.readdir(directory)) {
          if (file.startsWith(`${imageId}-`) && file.endsWith('.json') && file !== path.basename(editFile)) await fs.rm(await this.file(session, '.edits', file));
        }
      } catch {
        return { ...result, exportWarning: [result.exportWarning, 'Redaction saved, but older edit history could not be removed. Do not share this session folder until the history is removed.'].filter(Boolean).join(' ') };
      }
    }
    return result;
  }); }
  async image(id, imageId) {
    const session = this.get(id);
    const image = session.entries.flatMap(e => e.images).find(i => i.id === imageId);
    if (!image) throw new Error('Screenshot not found.');
    return `data:image/png;base64,${(await fs.readFile(await this.file(session, 'screenshots', image.name))).toString('base64')}`;
  }
}
module.exports = { SessionStore, atomicWrite };
