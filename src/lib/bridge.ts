import type { Bridge, Session, Settings, EditState } from '@/types';
import { readLocal, writeLocal } from './database';
import { applyEnhancedEntries, serializeJournal, slugify, suggestTitle } from '../../shared/journal.mjs';
import { createZip } from '../../shared/zip.mjs';

const defaults: Settings = { provider: 'openai', model: '', baseUrl: 'https://api.openai.com/v1', rootFolder: 'Browser library', format: 'md', hasApiKey: false, secureStorage: false, shortcut: '' };
let sessions: Session[] = [];
let settings = defaults;
const images: Record<string, string> = {};
const editStates: Record<string, EditState> = {};
const save = () => writeLocal('browser-library', { sessions, settings, images, editStates });
const sessionFor = (id: string) => { const result = sessions.find(s => s.id === id); if (!result) throw new Error('Session not found.'); return result; };
const desktopOnly = () => { throw new Error('Open the desktop app to use this feature.'); };

const browser: Bridge = {
  isDesktop: false,
  platform: 'browser',
  async init() {
    const value = await readLocal<{ sessions: Session[]; settings: Settings; images: Record<string, string>; editStates?: Record<string, EditState> }>('browser-library');
    if (value) { sessions = value.sessions; settings = { ...defaults, ...value.settings }; Object.assign(images, value.images); Object.assign(editStates, value.editStates ?? {}); }
    return { sessions: structuredClone(sessions), settings };
  },
  async append(payload) {
    const before = structuredClone(sessions), oldImages = { ...images }, oldEdits = { ...editStates };
    const now = new Date().toISOString();
    const title = payload.title || suggestTitle(payload.prompt);
    const session: Session = payload.sessionId ? sessionFor(payload.sessionId) : { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now, folder: `${now.slice(0, 10)}-${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`, entries: [] };
    if (!payload.sessionId) sessions.unshift(session);
    session.entries.push({ id: crypto.randomUUID(), prompt: payload.prompt.trim(), originalPrompt: payload.originalPrompt, createdAt: now, images: payload.images.map(image => {
      const name = `${String(session.entries.length + 1).padStart(3, '0')}-${image.id.slice(0, 8)}.png`;
      images[image.id] = image.dataUrl; if (image.editState) editStates[image.id] = image.editState;
      return { revision: image.editState ? 1 : undefined, id: image.id, path: `screenshots/${name}`, name, width: image.width, height: image.height, context: image.context };
    }) });
    session.updatedAt = now;
    try { await save(); } catch (error) { sessions = before; Object.keys(images).forEach(k => delete images[k]); Object.assign(images, oldImages); Object.keys(editStates).forEach(k => delete editStates[k]); Object.assign(editStates, oldEdits); throw error; }
    return structuredClone(session);
  },
  async rename(id, title) { if (!title.trim() || title.length > 120) throw new Error('Use a session title between 1 and 120 characters.'); const session = sessionFor(id), previous = structuredClone(session); session.title = title.trim(); session.updatedAt = new Date().toISOString(); try { await save(); } catch (error) { sessions = sessions.map(s => s.id === id ? previous : s); throw error; } return structuredClone(session); },
  async removeEntry(id, entryId) {
    const session = sessionFor(id), previous = structuredClone(session);
    session.entries = session.entries.filter(e => e.id !== entryId);
    session.updatedAt = new Date().toISOString();
    try { await save(); } catch (error) { sessions = sessions.map(s => s.id === id ? previous : s); throw error; }
    return structuredClone(session);
  },
  async deleteSession(id) {
    const session = sessionFor(id), previous = sessions, oldImages = { ...images }, oldEdits = { ...editStates };
    for (const image of session.entries.flatMap(e => e.images)) { delete images[image.id]; delete editStates[image.id]; }
    sessions = sessions.filter(s => s.id !== id);
    try { await save(); } catch (error) { sessions = previous; Object.assign(images, oldImages); Object.assign(editStates, oldEdits); throw error; }
  },
  async image(_id, imageId) { if (!images[imageId]) throw new Error('Image is missing.'); return images[imageId]; },
  async imageForEdit(id, imageId) {
    const image = sessionFor(id).entries.flatMap(e => e.images).find(i => i.id === imageId);
    if (!image || !images[imageId]) throw new Error('Screenshot not found.');
    return { ...image, dataUrl: images[imageId], editState: structuredClone(editStates[imageId]) };
  },
  async updateImage(id, imageId, input) {
    const session = sessionFor(id), image = session.entries.flatMap(e => e.images).find(i => i.id === imageId);
    if (!image) throw new Error('Screenshot not found.');
    const previous = structuredClone(session), oldData = images[imageId], oldState = editStates[imageId];
    images[imageId] = input.dataUrl; if (input.editState) editStates[imageId] = input.editState; else delete editStates[imageId];
    image.width = input.width; image.height = input.height; image.revision = (image.revision || 0) + 1; session.updatedAt = new Date().toISOString();
    try { await save(); } catch (error) { sessions = sessions.map(s => s.id === id ? previous : s); images[imageId] = oldData; editStates[imageId] = oldState; throw error; }
    return structuredClone(session);
  },
  async exportJournal(id, format) {
    const session = sessionFor(id);
    const files: { name: string; data: string | Uint8Array }[] = [{ name: `journal.${format}`, data: serializeJournal(session, format) }];
    for (const image of session.entries.flatMap(e => e.images)) files.push({ name: image.path, data: Uint8Array.from(atob(images[image.id].split(',')[1]), c => c.charCodeAt(0)) });
    const archive = createZip(files);
    const url = URL.createObjectURL(new Blob([archive as BlobPart], { type: 'application/zip' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${slugify(session.title)}.zip`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return anchor.download;
  },
  openFolder: async () => desktopOnly(),
  copy: text => navigator.clipboard.writeText(text),
  captureSources: async () => [],
  captureAccess: async () => ({ platform: 'browser', status: 'not-required', appName: 'Browser', appPath: '', packaged: false }),
  openCaptureSettings: async () => desktopOnly(),
  revealApplication: async () => desktopOnly(),
  restart: async () => desktopOnly(),
  hide: async () => desktopOnly(),
  openCopyPicker: async () => desktopOnly(),
  async capture() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture is unavailable in this browser. Import an image or open the desktop app.');
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try {
      const video = document.createElement('video'); video.srcObject = stream;
      await video.play();
      await new Promise<void>(resolve => video.requestVideoFrameCallback(() => resolve()));
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0); return { dataUrl: canvas.toDataURL('image/png'), context: { kind: 'screen', title: stream.getVideoTracks()[0]?.label || 'Browser-selected source', capturedAt: new Date().toISOString() } };
    } finally { stream.getTracks().forEach(track => track.stop()); }
  },
  async saveSettings(input) {
    if (input.apiKey) throw new Error('API keys are saved only in the desktop app’s protected storage.');
    const previous = settings;
    settings = { ...settings, provider: input.provider ?? settings.provider, model: input.model ?? settings.model, baseUrl: input.baseUrl ?? settings.baseUrl, format: input.format ?? settings.format };
    try { await save(); } catch (error) { settings = previous; throw error; }
    return settings;
  },
  chooseFolder: async () => desktopOnly(),
  enhance: async () => desktopOnly(),
  async applyEnhancement(id, updatedAt, entries) {
    const current = sessionFor(id);
    if (current.updatedAt !== updatedAt) throw new Error('This journal changed. Enhance it again to include the latest cards.');
    const next = entries === null ? { ...current, entries: current.entries.map(({ originalPrompt, ...entry }) => ({ ...entry, prompt: originalPrompt ?? entry.prompt })) } : applyEnhancedEntries(current, entries);
    next.updatedAt = new Date().toISOString();
    const previous = sessions; sessions = sessions.map(session => session.id === id ? next : session);
    try { await save(); } catch (error) { sessions = previous; throw error; }
    return structuredClone(next);
  },
  listModels: async () => desktopOnly(),
  onCaptureRequested: () => () => {},
};

export const api = window.canvasPilot ?? browser;

export async function imageFromSource(dataUrl: string, name = 'Screenshot') {
  const image = new Image(); image.src = dataUrl; await image.decode();
  if (image.width * image.height > 100000000) throw new Error('This image is too large. Choose an image below 100 megapixels.');
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  return { id: crypto.randomUUID(), name, dataUrl: canvas.toDataURL('image/png'), width: image.width, height: image.height };
}

export async function imageFromFile(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose an image smaller than 30 MB.');
  const url = URL.createObjectURL(file);
  try { return { ...await imageFromSource(url, file.name), context: { kind: 'import' as const, title: file.name, capturedAt: new Date().toISOString() } }; } finally { URL.revokeObjectURL(url); }
}
