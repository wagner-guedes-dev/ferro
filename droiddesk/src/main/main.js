'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const sdk = require('./sdk');
const avd = require('./avd');
const proxyLib = require('./proxy');
const meta = require('./meta');
const { EmulatorManager, killStrayEmulator } = require('./emulator');
const { setupUpdater } = require('./updater');
const browsers = require('./browsers');
const { SignalMonitor } = require('./signal');
const { HudManager } = require('./hud');

let win = null;
let store = null;
const emu = new EmulatorManager();
const bm = new browsers.BrowserManager();
const signal = new SignalMonitor();
let hud = null;
signal.on('signal', (e) => { send('signal', e); if (hud && e.quality !== 'off') hud.update(e.key, e); });
let sdkStatus = null;
let updater = null;

// Safety net: log unexpected errors instead of letting the whole app die.
function logError(kind, err) {
  try {
    const file = path.join(app.getPath('userData'), 'droiddesk-error.log');
    const text = `[${new Date().toISOString()}] ${kind}: ${err && err.stack ? err.stack : String(err)}\n`;
    fs.appendFileSync(file, text);
    if (fs.statSync(file).size > 2 * 1024 * 1024) fs.writeFileSync(file, text);
  } catch (_) { /* ignore */ }
}
process.on('uncaughtException', (err) => {
  logError('uncaughtException', err);
  if (win && !win.isDestroyed()) {
    dialog.showMessageBox(win, { type: 'error', title: 'DroidDesk', message: 'Ocorreu um erro interno, mas o app continua funcionando.', detail: `${err && err.message ? err.message : err}\n\nO detalhe foi gravado em droiddesk-error.log na pasta de dados (Configurações → Abrir).`, buttons: ['OK'] }).catch(() => {});
  }
});
process.on('unhandledRejection', (reason) => { logError('unhandledRejection', reason); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(boot);
}

function boot() {
  const { safeStorage } = require('electron');
  const codec = safeStorage && safeStorage.isEncryptionAvailable() ? {
    encrypt: (text) => `enc:${safeStorage.encryptString(text).toString('base64')}`,
    decrypt: (text) => (text.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(text.slice(4), 'base64')) : text),
  } : null;
  store = new Store(path.join(app.getPath('userData'), 'droiddesk-data.json'), codec);
  refreshSdk();
  Menu.setApplicationMenu(null);
  createWindow();
  updater = setupUpdater({ send, getWindow: () => win });
  hud = new HudManager({ getLang: () => store.settings.language || 'pt-BR' });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 980,
    minHeight: 600,
    backgroundColor: '#0b0d12',
    title: 'DroidDesk',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.on('closed', () => { win = null; });
  win.webContents.on('render-process-gone', (_e, details) => { logError('render-process-gone', new Error(details.reason)); if (win && !win.isDestroyed()) win.webContents.reload(); });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function syncSignal(kind, mgr, e) {
  const key = `${kind}:${e.profileId}`;
  const inst = mgr.instances.get(e.profileId);
  if (e.status === 'running' && inst && inst.proxy) {
    signal.track(key, { kind, profileId: e.profileId, proxy: inst.proxy });
    const p = (kind === 'browser' ? store.browsers : store.profiles).find((x) => x.id === e.profileId);
    if (hud && p && store.settings.proxyHud !== false) {
      hud.show(key, { name: p.name, kind, title: kind === 'profile' ? `${p.avdId}:${p.port}` : '', pid: inst.child ? inst.child.pid : null });
    }
  } else if (e.status === 'stopped') {
    signal.untrack(key);
    if (hud) hud.hide(key);
  }
}
emu.on('status', (e) => {
  const p = store.profiles.find((x) => x.id === e.profileId);
  if (p && e.status === 'running') { p.lastStartedAt = new Date().toISOString(); store.save(); }
  syncSignal('profile', emu, e);
  send('profile:status', e);
});
emu.on('log', (e) => send('profile:log', e));
bm.on('status', (e) => {
  const p = store.browsers.find((x) => x.id === e.profileId);
  if (p && e.status === 'running') { p.lastStartedAt = new Date().toISOString(); store.save(); }
  syncSignal('browser', bm, e);
  send('browser:status', e);
});
bm.on('log', (e) => send('browser:log', e));

function refreshSdk() {
  sdkStatus = sdk.getStatus(store.settings.sdkPath);
  emu.setSdk(sdkStatus);
  return sdkStatus;
}

app.on('before-quit', async (e) => {
  const anyEmu = [...emu.instances.values()].some((i) => i.status !== 'stopped');
  const anyBrowser = [...bm.instances.values()].some((i) => i.status !== 'stopped');
  if (anyEmu || anyBrowser) {
    e.preventDefault();
    signal.stopAll();
    if (hud) hud.hideAll();
    await Promise.all([emu.stopAll(), bm.stopAll()]);
    app.exit(0);
  }
});
app.on('window-all-closed', () => { app.quit(); });

// ---------- helpers ----------
const ok = (data) => ({ ok: true, data });
// IPC payloads come from our own renderer, but validate shapes anyway.
const asIds = (ids) => (Array.isArray(ids) ? ids.filter((x) => typeof x === 'string' && x.length <= 64).slice(0, 500) : []);
const asObj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const asStr = (v, max = 4096) => (typeof v === 'string' ? v.slice(0, max) : '');
function insideAllowedDirs(p) {
  const target = path.resolve(asStr(p));
  const roots = [app.getPath('userData'), avd.avdHome(store.settings.avdHome), sdkStatus ? sdkStatus.sdkPath : ''].filter(Boolean).map((r) => path.resolve(r));
  return roots.some((r) => target === r || target.startsWith(r + path.sep));
}
const fail = (err) => ({ ok: false, error: typeof err === 'string' ? err : (err && err.message) || 'UNKNOWN' });
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return ok(await fn(...args)); } catch (err) {
      if (!(err && /^[A-Z_]+(:.*)?$/.test(String(err.message || err)))) logError(`ipc ${channel}`, err);
      return fail(err);
    }
  });
}

function publicProfile(p) {
  return { ...p, status: emu.statusOf(p.id) };
}

function resolveProxy(profile) {
  if (profile.proxyMode === 'none') return null;
  if (profile.proxyMode === 'inline' && profile.proxy) return profile.proxy;
  if (profile.proxyMode === 'saved' && profile.proxyId) {
    const px = store.proxies.find((x) => x.id === profile.proxyId);
    return px || null;
  }
  return null;
}

function sanitizeProxy(input) {
  const p = {
    type: ['http', 'https', 'socks5', 'socks4'].includes(input.type) ? input.type : 'http',
    host: String(input.host || '').trim(),
    port: parseInt(input.port, 10),
    username: String(input.username || ''),
    password: String(input.password || ''),
  };
  if (!p.host || !Number.isFinite(p.port) || p.port < 1 || p.port > 65535) throw new Error('INVALID_PROXY');
  const lc = input.lastCheck;
  if (lc && typeof lc === 'object' && lc.ok === true && typeof lc.countryCode === 'string') {
    p.lastCheck = { ok: true, ip: String(lc.ip || ''), country: String(lc.country || ''), countryCode: lc.countryCode.slice(0, 2).toUpperCase(), city: String(lc.city || ''), timezone: String(lc.timezone || ''), latency: Number(lc.latency) || 0, lat: Number.isFinite(lc.lat) ? lc.lat : null, lon: Number.isFinite(lc.lon) ? lc.lon : null, checkedAt: String(lc.checkedAt || new Date().toISOString()) };
  }
  return p;
}

// ---------- app / settings ----------
handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  dataDir: app.getPath('userData'),
  avdHome: avd.avdHome(store.settings.avdHome),
}));
handle('settings:get', () => store.settings);
handle('settings:set', (patch) => {
  patch = asObj(patch);
  const allowed = {};
  for (const k of ['language', 'sdkPath', 'avdHome', 'viewMode', 'javaHome', 'browserPath']) if (k in patch) allowed[k] = asStr(patch[k], 1024).trim();
  if ('proxyHud' in patch) { allowed.proxyHud = !!patch.proxyHud; if (!allowed.proxyHud && hud) hud.hideAll(); }
  if ('language' in allowed && !['pt-BR', 'en'].includes(allowed.language)) delete allowed.language;
  if ('viewMode' in allowed && !['grid', 'list'].includes(allowed.viewMode)) delete allowed.viewMode;
  for (const k of ['sdkPath', 'avdHome', 'javaHome', 'browserPath']) if (k in allowed && /["\r\n]/.test(allowed[k])) throw new Error('INVALID_PATH');
  // Never silently move the virtual phones folder to a path that does not exist.
  if (allowed.avdHome && !fs.existsSync(allowed.avdHome)) throw new Error('AVD_HOME_MISSING');
  const s = store.setSettings(allowed);
  refreshSdk();
  return s;
});
handle('shell:openExternal', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
handle('shell:openPath', (p) => { if (!insideAllowedDirs(p)) throw new Error('PATH_NOT_ALLOWED'); return shell.openPath(path.resolve(p)); });
handle('dialog:pickFolder', async (title) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
handle('dialog:saveFile', async (opts) => {
  const r = await dialog.showSaveDialog(win, { title: opts.title, defaultPath: opts.defaultPath, filters: opts.filters });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, opts.content, 'utf8');
  return r.filePath;
});
handle('dialog:openFile', async (opts) => {
  const r = await dialog.showOpenDialog(win, { title: opts.title, filters: opts.filters, properties: ['openFile'] });
  if (r.canceled) return null;
  return { path: r.filePaths[0], content: fs.readFileSync(r.filePaths[0], 'utf8') };
});

// ---------- updates ----------
handle('update:status', () => updater.status());
handle('update:check', () => updater.check());
handle('update:install', () => updater.install());

// ---------- meta ----------
handle('meta:all', () => ({ devices: meta.DEVICES, countries: meta.COUNTRIES, versions: meta.ANDROID_VERSIONS }));

// ---------- sdk ----------
handle('sdk:status', () => refreshSdk());
handle('sdk:java', () => sdk.findJava(store.settings.javaHome));
handle('sdk:webcams', () => sdk.listWebcams(sdkStatus));
handle('signals:all', () => signal.all());
let installing = false;
handle('sdk:install', async (opts) => {
  if (installing) throw new Error('INSTALL_RUNNING');
  installing = true;
  try {
    const target = opts.sdkPath || store.settings.sdkPath || sdkStatus.sdkPath || sdk.defaultSdkInstallPath();
    const log = (line) => send('sdk:log', line);
    const status = await sdk.install({ sdkPath: target, api: opts.api, tag: opts.tag, abi: opts.abi, javaHome: store.settings.javaHome }, log);
    store.setSettings({ sdkPath: target });
    refreshSdk();
    return status;
  } finally { installing = false; }
});

// ---------- groups ----------
handle('groups:list', () => store.groups);
handle('groups:create', (name) => {
  name = String(name || '').trim();
  if (!name) throw new Error('INVALID_NAME');
  if (store.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) throw new Error('DUPLICATE');
  const g = { id: Store.newId(), name, createdAt: new Date().toISOString() };
  store.groups.push(g);
  store.save();
  return g;
});
handle('groups:rename', (id, name) => {
  const g = store.groups.find((x) => x.id === id);
  if (!g) throw new Error('NOT_FOUND');
  name = String(name || '').trim();
  if (!name) throw new Error('INVALID_NAME');
  g.name = name;
  store.save();
  return g;
});
handle('groups:delete', (id) => {
  store.data.groups = store.groups.filter((g) => g.id !== id);
  for (const p of store.profiles) if (p.groupId === id) p.groupId = null;
  for (const p of store.browsers) if (p.groupId === id) p.groupId = null;
  store.save();
  return true;
});

// ---------- proxies ----------
handle('proxies:list', () => store.proxies);
handle('proxies:create', (input) => {
  const p = { id: Store.newId(), name: String(input.name || '').trim(), ...sanitizeProxy(input), lastCheck: null, createdAt: new Date().toISOString() };
  if (!p.name) p.name = `${p.host}:${p.port}`;
  store.proxies.push(p);
  store.save();
  return p;
});
handle('proxies:bulkCreate', (text) => {
  const created = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const parsed = proxyLib.parseProxyString(line);
    if (!parsed) continue;
    const p = { id: Store.newId(), name: `${parsed.host}:${parsed.port}`, ...parsed, lastCheck: null, createdAt: new Date().toISOString() };
    store.proxies.push(p);
    created.push(p);
  }
  store.save();
  return created;
});
handle('proxies:update', (id, input) => {
  const p = store.proxies.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  const clean = sanitizeProxy(input);
  Object.assign(p, clean, { name: String(input.name || '').trim() || `${clean.host}:${clean.port}` });
  if (input.resetCheck) p.lastCheck = null;
  store.save();
  return p;
});
handle('proxies:delete', (id) => {
  if (store.profiles.some((pr) => pr.proxyMode === 'saved' && pr.proxyId === id) || store.browsers.some((pr) => pr.proxyMode === 'saved' && pr.proxyId === id)) throw new Error('PROXY_IN_USE');
  store.data.proxies = store.proxies.filter((x) => x.id !== id);
  store.save();
  return true;
});
handle('proxies:check', async (id) => {
  const p = store.proxies.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  try {
    p.lastCheck = await proxyLib.checkProxy(p);
  } catch (err) {
    p.lastCheck = { ok: false, error: err.message, checkedAt: new Date().toISOString() };
  }
  store.save();
  return p.lastCheck;
});
handle('proxies:test', async (input) => {
  // Test an unsaved proxy (from the dialog).
  return proxyLib.checkProxy(sanitizeProxy(input));
});
handle('proxies:parse', (str) => proxyLib.parseProxyString(str));

// ---------- profiles ----------
handle('profiles:list', () => store.profiles.map(publicProfile));
handle('profiles:statuses', () => emu.allStatuses());

function validateProfileInput(input, existing) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('INVALID_NAME');
  const country = meta.findCountry(input.country);
  const out = {
    name,
    groupId: input.groupId && store.groups.some((g) => g.id === input.groupId) ? input.groupId : null,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [],
    country: country.code,
    locale: String(input.locale || country.locale),
    timezone: String(input.timezone || country.timezone),
    deviceName: String(input.deviceName || '').trim(),
    notes: String(input.notes || ''),
    cameraFront: /^(emulated|virtualscene|none|webcam\d+)$/.test(String(input.cameraFront || '')) ? String(input.cameraFront) : 'emulated',
    cameraBack: /^(emulated|virtualscene|none|webcam\d+)$/.test(String(input.cameraBack || '')) ? String(input.cameraBack) : 'virtualscene',
    proxyMode: ['none', 'saved', 'inline'].includes(input.proxyMode) ? input.proxyMode : 'none',
    proxyId: null,
    proxy: null,
  };
  if (out.proxyMode === 'saved') {
    if (!store.proxies.some((p) => p.id === input.proxyId)) throw new Error('PROXY_NOT_FOUND');
    out.proxyId = input.proxyId;
  } else if (out.proxyMode === 'inline') {
    out.proxy = sanitizeProxy(input.proxy || {});
  }
  if (!existing) {
    const device = meta.findDevice(input.deviceId);
    const image = sdkStatus.images.find((i) => i.id === input.imageId);
    if (!image) throw new Error('IMAGE_NOT_FOUND');
    out.deviceId = device.id;
    out.device = { manufacturer: device.manufacturer, model: device.model, width: device.width, height: device.height, density: device.density };
    out.ram = Math.min(8192, Math.max(1024, parseInt(input.ram, 10) || device.ram));
    out.storage = Math.min(64, Math.max(2, parseInt(input.storage, 10) || 8));
    out.imageId = image.id;
    out.api = image.api;
    out.androidVersion = meta.androidVersionName(image.api);
    out.abi = image.abi;
    out._image = image;
    out._device = device;
  }
  return out;
}

handle('profiles:create', (input) => {
  const v = validateProfileInput(input, null);
  const id = Store.newId();
  const avdId = `droiddesk_${id}`;
  const port = store.allocatePort();
  avd.createAvd({
    avdId,
    displayName: v.name,
    image: v._image,
    device: v._device,
    ram: v.ram,
    storage: v.storage,
    home: store.settings.avdHome,
  });
  const profile = {
    id,
    serial: store.nextSerial(),
    avdId,
    port,
    createdAt: new Date().toISOString(),
    lastStartedAt: null,
    ...v,
  };
  delete profile._image;
  delete profile._device;
  store.profiles.push(profile);
  store.save();
  return publicProfile(profile);
});

handle('profiles:update', (id, input) => {
  const p = store.profiles.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  const v = validateProfileInput({ ...p, ...input }, p);
  Object.assign(p, v);
  avd.updateDisplayName(p.avdId, p.name, store.settings.avdHome);
  store.save();
  return publicProfile(p);
});

handle('profiles:move', (ids, groupId) => {
  ids = asIds(ids);
  const gid = groupId && store.groups.some((g) => g.id === groupId) ? groupId : null;
  for (const p of store.profiles) if (ids.includes(p.id)) p.groupId = gid;
  store.save();
  return true;
});

const deleting = new Set();
handle('profiles:delete', async (ids) => {
  ids = asIds(ids).filter((id) => !deleting.has(id));
  const failed = [];
  for (const id of ids) {
    const p = store.profiles.find((x) => x.id === id);
    if (!p) continue;
    deleting.add(id);
    send('profile:status', { profileId: id, status: 'deleting', detail: '' });
    try {
      await emu.stop(id);
      emu.instances.delete(id);
      // A crashed/orphaned emulator may still hold the phone's files.
      if (avd.avdLocked(p.avdId, store.settings.avdHome) || await killStrayEmulator(p.avdId)) await new Promise((r) => setTimeout(r, 1500));
      await avd.deleteAvd(p.avdId, store.settings.avdHome);
      store.data.profiles = store.profiles.filter((x) => x.id !== id);
      store.save();
    } catch (err) {
      logError('profiles:delete', err);
      failed.push(p.name);
      send('profile:status', { profileId: id, status: 'stopped', detail: '' });
    } finally { deleting.delete(id); }
  }
  if (failed.length) throw new Error(`DELETE_PARTIAL:${failed.join(', ')}`);
  return true;
});

handle('profiles:start', async (id, opts = {}) => {
  const p = store.profiles.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  refreshSdk();
  if (!sdkStatus.hasEmulator || !sdkStatus.hasAdb) throw new Error('SDK_MISSING');
  if (!avd.avdExists(p.avdId, store.settings.avdHome)) {
    const home = avd.avdHome(store.settings.avdHome);
    if (store.settings.avdHome && !fs.existsSync(home)) throw new Error('AVD_HOME_MISSING');
    const siblings = fs.existsSync(home) ? fs.readdirSync(home).filter((n) => n.endsWith('.avd')).length : 0;
    // The folder was removed outside the app. Only rebuild a blank phone if the
    // AVD home itself is intact; never when every phone is "missing" at once.
    if (store.profiles.length > 1 && siblings === 0 && store.profiles.some((x) => x.lastStartedAt)) throw new Error('AVD_HOME_MISSING');
    // AVD folder was deleted outside the app: recreate it from the profile.
    const image = sdkStatus.images.find((i) => i.id === p.imageId) || sdkStatus.images[0];
    if (!image) throw new Error('IMAGE_NOT_FOUND');
    avd.createAvd({ avdId: p.avdId, displayName: p.name, image, device: { ...meta.findDevice(p.deviceId), ...p.device, id: p.deviceId }, ram: p.ram, storage: p.storage, home: store.settings.avdHome });
  }
  const proxy = resolveProxy(p);
  return emu.start(p, proxy, { avdHome: store.settings.avdHome, cold: !!asObj(opts).cold });
});
handle('profiles:stop', (id) => emu.stop(id));
handle('profiles:log', (id) => emu.getLog(id));
handle('profiles:size', (id) => {
  const p = store.profiles.find((x) => x.id === id);
  return p ? avd.avdSizeBytes(p.avdId, store.settings.avdHome) : 0;
});
handle('profiles:export', (ids) => {
  const list = store.profiles.filter((p) => !ids || ids.includes(p.id)).map((p) => {
    const proxy = resolveProxy(p);
    return {
      serial: p.serial, name: p.name, group: (store.groups.find((g) => g.id === p.groupId) || {}).name || '',
      tags: p.tags, country: p.country, locale: p.locale, timezone: p.timezone, device: p.device, androidVersion: p.androidVersion,
      proxy: proxy ? `${proxy.type}://${proxy.username ? `${proxy.username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}` : '',
      notes: p.notes, createdAt: p.createdAt,
    };
  });
  return JSON.stringify(list, null, 2);
});
handle('profiles:checkProxy', async (id) => {
  const p = store.profiles.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  const proxy = resolveProxy(p);
  if (!proxy) return { ok: true, direct: true };
  try {
    const res = await proxyLib.checkProxy(proxy);
    proxy.lastCheck = res; store.save();
    return res;
  } catch (err) {
    const res = { ok: false, error: err.message, checkedAt: new Date().toISOString() };
    proxy.lastCheck = res; store.save();
    return res;
  }
});

// ---------- browser profiles ----------
function browserDataDir(p) { return path.join(app.getPath('userData'), 'browser-profiles', p.id); }
function publicBrowser(p) { return { ...p, status: bm.statusOf(p.id) }; }
function resolveBrowserPath(p) {
  const list = browsers.detectBrowsers(store.settings.browserPath);
  if (p.browserId && p.browserId !== 'auto') {
    const found = list.find((b) => b.id === p.browserId || b.path === p.browserId);
    if (found) return found;
  }
  return list[0] || null;
}
function validateBrowserInput(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('INVALID_NAME');
  const country = meta.findCountry(input.country);
  const out = {
    name,
    groupId: input.groupId && store.groups.some((g) => g.id === input.groupId) ? input.groupId : null,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [],
    browserId: String(input.browserId || 'auto'),
    country: country.code,
    locale: String(input.locale || country.locale),
    timezone: String(input.timezone || country.timezone),
    width: Math.min(3840, Math.max(400, parseInt(input.width, 10) || 1280)),
    height: Math.min(2160, Math.max(300, parseInt(input.height, 10) || 800)),
    startUrl: /^https?:\/\//i.test(String(input.startUrl || '').trim()) ? String(input.startUrl).trim() : '',
    notes: String(input.notes || ''),
    proxyMode: ['none', 'saved', 'inline'].includes(input.proxyMode) ? input.proxyMode : 'none',
    proxyId: null,
    proxy: null,
  };
  if (out.proxyMode === 'saved') {
    if (!store.proxies.some((p) => p.id === input.proxyId)) throw new Error('PROXY_NOT_FOUND');
    out.proxyId = input.proxyId;
  } else if (out.proxyMode === 'inline') {
    out.proxy = sanitizeProxy(input.proxy || {});
  }
  return out;
}
handle('browsers:detect', () => browsers.detectBrowsers(store.settings.browserPath));
handle('browsers:list', () => store.browsers.map(publicBrowser));
handle('browsers:create', (input) => {
  const v = validateBrowserInput(input);
  const p = { id: Store.newId(), serial: store.nextSerial(), createdAt: new Date().toISOString(), lastStartedAt: null, ...v };
  store.browsers.push(p);
  store.save();
  return publicBrowser(p);
});
handle('browsers:update', (id, input) => {
  const p = store.browsers.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  Object.assign(p, validateBrowserInput({ ...p, ...input }));
  store.save();
  return publicBrowser(p);
});
handle('browsers:move', (ids, groupId) => {
  ids = asIds(ids);
  const gid = groupId && store.groups.some((g) => g.id === groupId) ? groupId : null;
  for (const p of store.browsers) if (ids.includes(p.id)) p.groupId = gid;
  store.save();
  return true;
});
handle('browsers:delete', async (ids) => {
  ids = asIds(ids).filter((id) => !deleting.has(id));
  const failed = [];
  for (const id of ids) {
    const p = store.browsers.find((x) => x.id === id);
    if (!p) continue;
    deleting.add(id);
    send('browser:status', { profileId: id, status: 'deleting', detail: '' });
    try {
      await bm.stop(id);
      bm.instances.delete(id);
      await fs.promises.rm(browserDataDir(p), { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
      store.data.browsers = store.browsers.filter((x) => x.id !== id);
      store.save();
    } catch (err) {
      logError('browsers:delete', err);
      failed.push(p.name);
      send('browser:status', { profileId: id, status: 'stopped', detail: '' });
    } finally { deleting.delete(id); }
  }
  if (failed.length) throw new Error(`DELETE_PARTIAL:${failed.join(', ')}`);
  return true;
});
handle('browsers:start', async (id) => {
  const p = store.browsers.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  const b = resolveBrowserPath(p);
  if (!b) throw new Error('BROWSER_MISSING');
  return bm.start(p, resolveProxy(p), { browserPath: b.path, dataDir: browserDataDir(p) });
});
handle('browsers:stop', (id) => bm.stop(id));
handle('browsers:log', (id) => bm.getLog(id));
handle('browsers:size', (id) => { const p = store.browsers.find((x) => x.id === id); return p ? browsers.dirSize(browserDataDir(p)) : 0; });
handle('browsers:folder', (id) => { const p = store.browsers.find((x) => x.id === id); if (p) shell.openPath(browserDataDir(p)); });
handle('browsers:checkProxy', async (id) => {
  const p = store.browsers.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  const proxy = resolveProxy(p);
  if (!proxy) return { ok: true, direct: true };
  try { const res = await proxyLib.checkProxy(proxy); proxy.lastCheck = res; store.save(); return res; }
  catch (err) { const res = { ok: false, error: err.message, checkedAt: new Date().toISOString() }; proxy.lastCheck = res; store.save(); return res; }
});
