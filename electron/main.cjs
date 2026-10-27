const { app, BrowserWindow, ipcMain, desktopCapturer, screen, dialog, clipboard, shell, safeStorage, globalShortcut, nativeTheme, Menu, systemPreferences, Tray, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { SessionStore, atomicWrite } = require('./store.cjs');
const { PROVIDERS, validateBaseUrl, providerBase, listModels, enhance } = require('./providers.cjs');
const { captureSources } = require('./capture-access.cjs');
const { registerSequence } = require('./shortcut-sequence.cjs');
const windowContext = require('./window-context.cjs');
const { trackWindowMotion, hideWindow, showWindow } = require('./window-motion.cjs');
const { randomUUID } = require('node:crypto');
// Preserve the original development library when opening the named app bundle.
app.setPath('userData', process.env.CANVASPILOT_USER_DATA ? path.resolve(process.env.CANVASPILOT_USER_DATA) : path.join(app.getPath('appData'), 'canvaspilot'));
app.setName('CanvasPilot');
const devUrl = !app.isPackaged && process.env.VITE_DEV_SERVER_URL === 'http://127.0.0.1:5173' ? process.env.VITE_DEV_SERVER_URL : null;
const indexFile = path.join(__dirname, '../dist/index.html');
let mainWindow, store, captureWindow, activeCapture, captureStarting = false;
let settings, secrets = {}, memoryKeys = {}, secureStorage = null;
let settingsQueue = Promise.resolve();
let allowedRoot, tray, quickWindow, shortcutSequence, quitting = false;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const secure = () => (secureStorage = safeStorage.isEncryptionAvailable() && !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'));
const credentialId = (value = settings) => `${value.provider}:${value.baseUrl}`;
const publicSettings = () => ({ ...settings, hasApiKey: Boolean(memoryKeys[credentialId()] || secrets[credentialId()]), secureStorage });
function providerKey(value = settings) {
  const identity = credentialId(value);
  if (memoryKeys[identity]) return memoryKeys[identity];
  if (!secrets[identity]) return '';
  try { return safeStorage.decryptString(Buffer.from(secrets[identity], 'base64')); }
  catch { throw new Error('Your API key could not be unlocked. Enter it again in Settings.'); }
}

async function loadSettings() {
  const defaults = { provider: 'openai', model: '', baseUrl: PROVIDERS.openai.baseUrl, rootFolder: process.env.CANVASPILOT_SESSIONS || path.join(app.getPath('documents'), 'CanvasPilot'), format: 'md', shortcut: 'CommandOrControl+Shift+2' };
  try {
    const saved = JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
    settings = { ...defaults, ...saved.settings }; secrets = saved.secrets ?? {};
  } catch (error) { if (error.code !== 'ENOENT') console.warn('Settings could not be loaded:', error.message); settings = defaults; }
  settings.shortcut = '⌥ U → I';
  if (!PROVIDERS[settings.provider]) settings.provider = 'openai';
}

function protect(window) {
  trackWindowMotion(window);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
}
function trustedSender(window, event) {
  const expectedUrl = devUrl ? `${devUrl}/` : pathToFileURL(indexFile).href;
  return window && event.sender === window.webContents && event.senderFrame === event.sender.mainFrame && event.senderFrame?.url?.split('#')[0] === expectedUrl;
}
async function createWindow() {
  mainWindow = new BrowserWindow({ width: 680, height: 640, minWidth: 560, minHeight: 500, show: false, backgroundColor: '#090909', title: 'CanvasPilot', icon: path.join(__dirname, process.platform === 'win32' ? '../build/icon.ico' : '../dist/app-icon.png'), titleBarStyle: 'hidden', ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 19 } } : { titleBarOverlay: { color: '#090909', symbolColor: '#bcbcbc', height: 52 } }), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  protect(mainWindow);
  if (devUrl) await mainWindow.loadURL(devUrl); else await mainWindow.loadFile(indexFile);
  showWindow(mainWindow);
  mainWindow.on('close', event => { if (!quitting && tray) { event.preventDefault(); hideMain(); } });
  mainWindow.on('closed', () => { mainWindow = null; captureWindow?.close(); });
}
function showMain() {
  if (process.platform === 'darwin') app.dock?.show();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  showWindow(mainWindow); mainWindow?.focus();
}
async function hideMain() {
  if (!tray) throw new Error('The menu-bar icon is unavailable. Keep the window open.');
  await hideWindow(mainWindow);
  if (process.platform === 'darwin' && !mainWindow?.isVisible()) app.dock?.hide();
}
async function requestCapture() {
  if (captureStarting || activeCapture) return;
  await hideWindow(quickWindow); mainWindow?.webContents.send('capture:requested');
}
async function openCopyPicker() {
  if (!quickWindow) {
    quickWindow = new BrowserWindow({ width: 520, height: 400, ...(process.platform === 'darwin' ? { type: 'panel', hiddenInMissionControl: true, acceptFirstMouse: true } : {}), show: false, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, title: 'CanvasPilot — Copy session', webPreferences: { preload: path.join(__dirname, 'quick-copy-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    protect(quickWindow);
    quickWindow.on('closed', () => { quickWindow = null; });
    quickWindow.on('blur', () => { void hideWindow(quickWindow); });
    quickWindow.on('hide', () => { quickWindow.webContents.send('quick:hide'); });
    if (devUrl) await quickWindow.loadURL(`${devUrl}/#quick-copy`); else await quickWindow.loadFile(indexFile, { hash: 'quick-copy' });
  }
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  quickWindow.setPosition(Math.round(workArea.x + (workArea.width - 520) / 2), Math.round(workArea.y + Math.min(180, workArea.height * .18)));
  quickWindow.webContents.send('quick:show');
  showWindow(quickWindow); quickWindow.focus();
}
function setupBackground() {
  const logo = nativeImage.createFromPath(path.join(__dirname, process.platform === 'darwin' ? '../dist/logo.png' : '../dist/app-icon.png'));
  const icon = nativeImage.createFromBitmap(logo.resize({ width: 32, height: 32 }).toBitmap(), { width: 32, height: 32, scaleFactor: 2 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon); tray.setToolTip('CanvasPilot');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open CanvasPilot', click: showMain },
    { label: 'Capture area  ·  ⌥ U → I', click: requestCapture },
    { label: 'Copy a session…  ·  ⌥ U → I → P', click: () => void openCopyPicker() },
    { type: 'separator' }, { label: 'Quit CanvasPilot', click: () => app.quit() },
  ]));
  tray.on('double-click', showMain);
  shortcutSequence = registerSequence(globalShortcut, { capture: requestCapture, copy: () => void openCopyPicker(), unavailable: () => { showMain(); dialog.showMessageBox(mainWindow, { message: 'This shortcut is in use by another app.', detail: 'Capture and Copy session remain available from the CanvasPilot menu bar icon.' }); } });
  if (!shortcutSequence.registered) settings.shortcut = '';
  setupQuickCopyHandlers();
}
function setupQuickCopyHandlers() {
  const actions = {
    list: async () => ({
      sessions: (await store.load()).map(({ id, title, entries }) => ({ id, title, entries: entries.length })),
      format: settings.format,
    }),
    copy: async (id, format) => {
      const { serializeJournal } = await import('../shared/journal.mjs');
      clipboard.writeText(serializeJournal(store.get(id), format ?? settings.format));
      await hideWindow(quickWindow);
    },
    close: () => hideWindow(quickWindow),
  };
  for (const [channel, action] of Object.entries(actions)) ipcMain.handle(`quick:${channel}`, async (event, ...args) => {
    if (!trustedSender(quickWindow, event)) throw new Error('Untrusted copy request.');
    return action(...args);
  });
}
function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trustedSender(mainWindow, event)) throw new Error('Untrusted request.');
    return callback(...args);
  });
}

async function startCapture(sourceId, target = {}) {
  if (captureStarting || activeCapture) throw new Error('A screen capture is already in progress.');
  const automatic = sourceId === 'current';
  if (!automatic && (typeof sourceId !== 'string' || !/^(window|screen):/.test(sourceId))) throw new Error('Choose a window or display.');
  const sessionId = target?.sessionId;
  const captureStore = store;
  const sessionTitle = sessionId ? captureStore.get(sessionId).title : String(target?.title || '').trim().slice(0, 120);
  captureStarting = true;
  let resolveCapture;
  const result = new Promise(resolve => { resolveCapture = resolve; });
  const state = activeCapture = {
    info: null, committing: false, saving: false, image: null,
    async sessions() {
      if (state.info?.mode !== 'caption') throw new Error('Select an area before choosing a session.');
      return (await captureStore.load()).map(session => ({ id: session.id, title: session.title, updatedAt: session.updatedAt, entries: session.entries.length }));
    },
    async finish(value) {
      if (activeCapture !== state || state.finishing) return;
      state.finishing = true;
      await hideWindow(captureWindow);
      activeCapture = null;
      const overlay = captureWindow; captureWindow = null; overlay?.close();
      if (!automatic && !value && !quitting) { showWindow(mainWindow); mainWindow?.focus(); }
      resolveCapture(value);
    },
    async save(input) {
      if (!state.image || state.saving) throw new Error('A capture is not ready to save.');
      if (typeof input?.caption !== 'string' || input.caption.length > 50000) throw new Error('Keep the caption under 50,000 characters.');
      if (typeof input.sessionTitle !== 'string' || input.sessionTitle.length > 120 || (input.sessionId !== undefined && (typeof input.sessionId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(input.sessionId)))) throw new Error('Choose a valid session or a new session name under 120 characters.');
      state.saving = true;
      try {
        const image = { ...input.image, id: state.image.id, width: state.image.width, height: state.image.height, context: state.image.context };
        const title = input.sessionId ? captureStore.get(input.sessionId).title : input.sessionTitle.trim();
        const savedSession = await captureStore.append({ sessionId: input.sessionId, title, prompt: input.caption, images: [image] });
        await state.finish({ dataUrl: image.dataUrl, context: image.context, savedSession });
      } finally { state.saving = false; }
    },
  };
  try {
    const displays = screen.getAllDisplays();
    let display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const ownIds = [mainWindow, quickWindow].filter(Boolean).map(window => window.getMediaSourceId());
    const candidates = automatic ? (await windowContext.read()).filter(window => !ownIds.includes(window.id)) : [];
    let windowTarget, initialSource;
    if (automatic) {
      if (candidates.length) {
        const windows = await captureSources(desktopCapturer, systemPreferences, process.platform, { types: ['window'], thumbnailSize: { width: 320, height: 180 } }, BrowserWindow.getAllWindows().map(window => window.getMediaSourceId()));
        // Fullscreen transitions may add non-capturable companion windows ahead of the real window.
        windowTarget = candidates.find(candidate => windows.some(source => source.id === candidate.id));
        if (!windowTarget) throw new Error('The current window is no longer available for capture. Try again once it is visible.');
        initialSource = windows.find(source => source.id === windowTarget.id);
      }
      if (windowTarget) sourceId = windowTarget.id;
      else {
        const sources = await captureSources(desktopCapturer, systemPreferences, process.platform, { types: ['screen'], thumbnailSize: { width: 320, height: 180 } }, BrowserWindow.getAllWindows().map(window => window.getMediaSourceId()));
        const source = sources.find(item => item.display_id === String(display.id));
        if (!source) throw new Error('No current window or display is available.');
        sourceId = source.id;
      }
    }
    await hideWindow(mainWindow);
    await new Promise(resolve => setTimeout(resolve, 120));
    const largest = displays.reduce((max, d) => ({ width: Math.max(max.width, d.size.width * d.scaleFactor), height: Math.max(max.height, d.size.height * d.scaleFactor) }), { width: 1, height: 1 });
    const fullSize = { width: Math.min(8192, Math.ceil(largest.width)), height: Math.min(8192, Math.ceil(largest.height)) };
    const live = process.platform === 'darwin' && (sourceId.startsWith('screen:') || !!windowTarget);
    const readSource = async thumbnailSize => {
      const sources = await captureSources(desktopCapturer, systemPreferences, process.platform, { types: [sourceId.startsWith('window:') ? 'window' : 'screen'], thumbnailSize }, BrowserWindow.getAllWindows().map(window => window.getMediaSourceId()));
      const source = sources.find(item => item.id === sourceId);
      if (!source) throw new Error('The selected window or display is no longer available. Choose another source.');
      if (source.thumbnail.isEmpty()) throw new Error('This source returned an empty image. Try another window or import an image.');
      return source;
    };
    let source = initialSource ?? await readSource(live ? { width: 320, height: 180 } : fullSize);
    display = windowTarget ? screen.getDisplayMatching(windowTarget.bounds) : displays.find(item => String(item.id) === source.display_id) ?? display;
    if (live && !windowTarget && String(display.id) !== source.display_id) throw new Error('The selected display is no longer available.');
    const sourceBounds = windowTarget?.bounds ?? display.bounds;
    const left = Math.max(sourceBounds.x, display.bounds.x), top = Math.max(sourceBounds.y, display.bounds.y);
    const selectionBounds = { x: left, y: top, width: Math.min(sourceBounds.x + sourceBounds.width, display.bounds.x + display.bounds.width) - left, height: Math.min(sourceBounds.y + sourceBounds.height, display.bounds.y + display.bounds.height) - top };
    if (live && (selectionBounds.width < 2 || selectionBounds.height < 2)) throw new Error('The current window is no longer visible.');
    let context = { kind: sourceId.startsWith('window:') ? 'window' : 'screen', title: source.name || 'Title unavailable', capturedAt: new Date().toISOString() };
    state.info = { mode: 'selection', immediate: true, ...(live ? { liveSize: { width: selectionBounds.width, height: selectionBounds.height }, liveOffset: { x: left - display.bounds.x, y: top - display.bounds.y }, sourceTitle: windowTarget ? source.name : undefined } : { source: source.thumbnail.toDataURL() }) };
    state.complete = async region => {
      if (state.committing || state.image) return;
      const size = live ? state.info.liveSize : source.thumbnail.getSize();
      if (!region || !['x', 'y', 'width', 'height'].every(key => Number.isInteger(region[key])) || region.x < 0 || region.y < 0 || region.width < 2 || region.height < 2 || region.x + region.width > size.width || region.y + region.height > size.height) throw new Error('Choose a valid screen region.');
      state.committing = true;
      try {
        await hideWindow(captureWindow);
        if (live) {
          const current = screen.getAllDisplays().find(item => item.id === display.id);
          if (!current || ['x', 'y', 'width', 'height'].some(key => current.bounds[key] !== display.bounds[key]) || current.scaleFactor !== display.scaleFactor) throw new Error('The display layout changed. Capture again.');
          if (windowTarget) {
            const [currentWindow] = await windowContext.read(windowTarget.id);
            if (!currentWindow || ['x', 'y', 'width', 'height'].some(key => currentWindow.bounds[key] !== sourceBounds[key])) throw new Error('The window moved or closed. Capture again.');
          }
          await new Promise(resolve => setTimeout(resolve, 120));
          if (activeCapture !== state) return;
          source = await readSource(fullSize);
          if (activeCapture !== state) return;
          if (!windowTarget && source.display_id !== String(display.id)) throw new Error('The selected display changed. Capture again.');
          context = { kind: windowTarget ? 'window' : 'screen', title: source.name || 'Title unavailable', capturedAt: new Date().toISOString() };
          const pixels = source.thumbnail.getSize();
          const sourceX = region.x + selectionBounds.x - sourceBounds.x, sourceY = region.y + selectionBounds.y - sourceBounds.y;
          const x = Math.round(sourceX / sourceBounds.width * pixels.width), y = Math.round(sourceY / sourceBounds.height * pixels.height);
          region = { x, y, width: Math.round((sourceX + region.width) / sourceBounds.width * pixels.width) - x, height: Math.round((sourceY + region.height) / sourceBounds.height * pixels.height) - y };
        }
        const image = source.thumbnail.crop(region);
        state.image = { id: randomUUID(), name: 'capture.png', dataUrl: image.toDataURL(), ...image.getSize(), context };
        state.info = { mode: 'caption', image: state.image, sessionId, sessionTitle };
        resizeCaptureCard(false);
        captureWindow.webContents.send('capture:stage', state.info);
        showWindow(captureWindow);
      } catch (error) { await showCaptureError(error); }
      finally { state.committing = false; }
    };
    await openCaptureOverlay(display.bounds);
  } catch (error) {
    if (automatic) await showCaptureError(error);
    else { await state.finish(null); throw error; }
  } finally { captureStarting = false; }
  return result;
}
function resizeCaptureCard(editing, expanded = false, animate = false) {
  const display = screen.getDisplayMatching(captureWindow.getBounds());
  const area = display.workArea;
  const width = Math.min(expanded ? 1160 : 420, area.width - 24), height = Math.min(expanded ? 840 : editing ? 610 : 350, area.height - 24);
  captureWindow.setBounds({ x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height }, animate && !systemPreferences.getAnimationSettings().prefersReducedMotion);
}
async function showCaptureError(error) {
  const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
  activeCapture.info = { mode: 'error', message, permission: message.includes('SCREEN_PERMISSION') };
  if (!captureWindow) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    await openCaptureOverlay({ x: Math.round(area.x + (area.width - 420) / 2), y: Math.round(area.y + (area.height - 350) / 2), width: 420, height: 350 });
  } else {
    resizeCaptureCard(false);
    captureWindow.webContents.send('capture:stage', activeCapture.info);
    showWindow(captureWindow);
  }
}
async function openCaptureOverlay(bounds) {
  const state = activeCapture;
  captureWindow = new BrowserWindow({ ...bounds, ...(process.platform === 'darwin' ? { type: 'panel' } : {}), frame: false, resizable: false, movable: false, fullscreenable: false, hiddenInMissionControl: true, acceptFirstMouse: true, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, transparent: true, backgroundColor: '#00000000', show: false, webPreferences: { preload: path.join(__dirname, 'capture-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  protect(captureWindow);
  captureWindow.setAlwaysOnTop(true, 'floating');
  if (process.platform !== 'darwin') captureWindow.setVisibleOnAllWorkspaces(true);
  captureWindow.on('closed', () => state.finish(null));
  if (devUrl) await captureWindow.loadURL(`${devUrl}/#capture`); else await captureWindow.loadFile(indexFile, { hash: 'capture' });
  if (activeCapture === state) showWindow(captureWindow);
}
function setupCaptureIPC() {
  for (const channel of ['frame', 'complete', 'cancel', 'save', 'sessions', 'resize', 'open-settings']) ipcMain.handle(`capture:${channel}`, (event, input) => {
    if (!trustedSender(captureWindow, event)) throw new Error('Untrusted capture request.');
    if (channel === 'frame') return activeCapture.info;
    if (channel === 'cancel') { if (!activeCapture.committing && !activeCapture.saving) return activeCapture.finish(null); return; }
    if (channel === 'save') return activeCapture.save(input);
    if (channel === 'sessions') return activeCapture.sessions();
    if (channel === 'resize') {
      if (activeCapture.info.mode !== 'caption' || typeof input?.editing !== 'boolean' || typeof input?.expanded !== 'boolean' || (input.expanded && !input.editing)) throw new Error('Choose a valid editor size.');
      resizeCaptureCard(input.editing, input.expanded, true); return;
    }
    if (channel === 'open-settings') return process.platform === 'darwin' ? shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture') : undefined;
    if (activeCapture.info.mode !== 'selection') throw new Error('Select a capture source first.');
    return activeCapture.complete(input);
  });
}

async function setup() {
  nativeTheme.themeSource = 'dark';
  await loadSettings();
  store = new SessionStore(settings.rootFolder);
  await store.load();
  handle('app:init', async () => ({ sessions: await store.load(), settings: publicSettings() }));
  handle('session:append', payload => store.append(payload));
  handle('session:rename', (id, title) => store.rename(id, title));
  handle('journal:apply-enhancement', (id, updatedAt, entries) => store.applyEnhancement(id, updatedAt, entries));
  handle('session:remove-entry', (id, entryId) => store.removeEntry(id, entryId));
  handle('session:image-edit', (id, imageId) => store.imageForEdit(id, imageId));
  handle('session:update-image', (id, imageId, image) => store.updateImage(id, imageId, image));
  handle('session:image', (id, imageId) => store.image(id, imageId));
  handle('session:delete', id => {
    const target = store;
    return target.run(async () => { await shell.trashItem(target.get(id).folder); target.sessions.delete(id); });
  });
  handle('session:open', async id => { const error = await shell.openPath(store.get(id).folder); if (error) throw new Error(error); });
  handle('clipboard:copy', text => { if (typeof text !== 'string' || text.length > 10000000) throw new Error('Clipboard content is too large.'); clipboard.writeText(text); });
  handle('session:export', async (id, format) => {
    const { FORMATS, serializeJournal, slugify } = await import('../shared/journal.mjs');
    if (!FORMATS.includes(format)) throw new Error('Unsupported export format.');
    const session = store.get(id);
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: path.join(session.folder, `${slugify(session.title)}.${format}`), filters: [{ name: 'Journal', extensions: [format] }] });
    if (result.canceled || !result.filePath) return null;
    await atomicWrite(result.filePath, serializeJournal(session, format)); return result.filePath;
  });
  handle('settings:folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.rootFolder });
    allowedRoot = result.canceled ? null : result.filePaths[0]; return allowedRoot;
  });
  handle('settings:models', async input => {
    if (!input || typeof input !== 'object') throw new Error('Choose an AI provider.');
    const value = { provider: input.provider, baseUrl: providerBase(input) };
    if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 10000)) throw new Error('Invalid API key.');
    return listModels(value, input.apiKey?.trim() || (input.clearApiKey ? '' : providerKey(value)));
  });
  handle('settings:save', input => {
    const operation = settingsQueue.then(() => saveSettings(input));
    settingsQueue = operation.catch(() => {});
    return operation;
  });
  async function saveSettings(input) {
    if (!input || typeof input !== 'object') throw new Error('Invalid settings.');
    const provider = input.provider ?? settings.provider;
    if (!PROVIDERS[provider]) throw new Error('Choose an AI provider.');
    const next = { ...settings, provider, model: String(input.model ?? settings.model).trim().slice(0, 200), baseUrl: ['compatible', 'ollama'].includes(provider) ? validateBaseUrl(input.baseUrl ?? settings.baseUrl) : PROVIDERS[provider].baseUrl, format: input.format ?? settings.format };
    const { FORMATS } = await import('../shared/journal.mjs');
    if (!FORMATS.includes(next.format)) throw new Error('Unsupported export format.');
    if (input.rootFolder && input.rootFolder !== settings.rootFolder) {
      if (input.rootFolder !== allowedRoot) throw new Error('Choose a folder using the folder picker.');
      if (activeCapture || captureStarting) throw new Error('Finish or discard the current capture before changing libraries.');
      await store.queue;
      next.rootFolder = allowedRoot;
    }
    const id = credentialId(next), nextSecrets = { ...secrets }, nextMemory = { ...memoryKeys };
    if (input.clearApiKey) { delete nextSecrets[id]; delete nextMemory[id]; }
    if (input.apiKey) {
      if (typeof input.apiKey !== 'string' || input.apiKey.length > 10000) throw new Error('Invalid API key.');
      if (secure()) { nextSecrets[id] = safeStorage.encryptString(input.apiKey.trim()).toString('base64'); delete nextMemory[id]; }
      else { nextMemory[id] = input.apiKey.trim(); delete nextSecrets[id]; }
    }
    const nextStore = next.rootFolder === settings.rootFolder ? store : new SessionStore(next.rootFolder);
    if (nextStore !== store) await nextStore.load();
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await atomicWrite(settingsFile(), JSON.stringify({ settings: next, secrets: nextSecrets }, null, 2));
    settings = next; secrets = nextSecrets; memoryKeys = nextMemory; store = nextStore; return publicSettings();
  }
  handle('journal:enhance', async (id, format) => {
    const session = structuredClone(store.get(id));
    return { session, entries: await enhance({ ...settings }, providerKey(), session, format) };
  });
  handle('capture:sources', async () => {
    try {
      const sources = await captureSources(desktopCapturer, systemPreferences, process.platform, { types: ['window', 'screen'], thumbnailSize: { width: 320, height: 180 } }, BrowserWindow.getAllWindows().map(window => window.getMediaSourceId()));
      const ownIds = new Set([mainWindow, quickWindow, captureWindow].filter(Boolean).map(window => window.getMediaSourceId()));
      return sources.filter(source => !ownIds.has(source.id)).map(source => ({ id: source.id, name: source.name || 'Title unavailable', thumbnail: source.thumbnail.toDataURL(), kind: source.id.startsWith('window:') ? 'window' : 'screen' }));
    } catch (error) { if (error.message.includes('SCREEN_PERMISSION')) throw error; throw new Error('Screen capture is unavailable. Try again or import an image.'); }
  });
  const ownBundle = () => process.platform === 'darwin' ? process.execPath.slice(0, process.execPath.indexOf('.app/') + 4) : process.execPath;
  handle('capture:access', () => ({ platform: process.platform, status: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'not-required', appName: app.isPackaged ? 'CanvasPilot' : 'Electron', appPath: ownBundle(), packaged: app.isPackaged }));
  handle('capture:settings', () => process.platform === 'darwin' ? shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture') : undefined);
  handle('capture:reveal-app', () => shell.showItemInFolder(ownBundle()));
  handle('app:hide', hideMain);
  handle('quick:open', openCopyPicker);
  handle('app:restart', () => { app.relaunch(); setTimeout(() => app.quit(), 250); });
  handle('capture:start', startCapture);
  setupCaptureIPC();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  await createWindow();
  setupBackground();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showMain);
  app.whenReady().then(setup).catch(error => { dialog.showErrorBox('CanvasPilot could not start', error.message); app.quit(); });
  app.on('activate', (_event, hasVisibleWindows) => { if (captureStarting || activeCapture || quickWindow?.isVisible()) return; if (!mainWindow) createWindow(); else if (!hasVisibleWindows) showMain(); });
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { shortcutSequence?.dispose(); globalShortcut.unregisterAll(); tray?.destroy(); });
}
