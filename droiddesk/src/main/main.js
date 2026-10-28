'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const sdk = require('./sdk');
const avd = require('./avd');
const proxyLib = require('./proxy');
const meta = require('./meta');
const { EmulatorManager } = require('./emulator');

let win = null;
let store = null;
const emu = new EmulatorManager();
let sdkStatus = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(boot);
}

function boot() {
  store = new Store(path.join(app.getPath('userData'), 'droiddesk-data.json'));
  refreshSdk();
  Menu.setApplicationMenu(null);
  createWindow();
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
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

emu.on('status', (e) => {
  const p = store.profiles.find((x) => x.id === e.profileId);
  if (p && e.status === 'running') { p.lastStartedAt = new Date().toISOString(); store.save(); }
  send('profile:status', e);
});
emu.on('log', (e) => send('profile:log', e));

function refreshSdk() {
  sdkStatus = sdk.getStatus(store.settings.sdkPath);
  emu.setSdk(sdkStatus);
  return sdkStatus;
}

app.on('before-quit', async (e) => {
  if (emu.instances.size && [...emu.instances.values()].some((i) => i.status !== 'stopped')) {
    e.preventDefault();
    await emu.stopAll();
    app.exit(0);
  }
});
app.on('window-all-closed', () => { app.quit(); });

// ---------- helpers ----------
const ok = (data) => ({ ok: true, data });
const fail = (err) => ({ ok: false, error: typeof err === 'string' ? err : (err && err.message) || 'UNKNOWN' });
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return ok(await fn(...args)); } catch (err) { return fail(err); }
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
  const allowed = {};
  for (const k of ['language', 'sdkPath', 'avdHome', 'viewMode', 'javaHome']) if (k in patch) allowed[k] = patch[k];
  const s = store.setSettings(allowed);
  refreshSdk();
  return s;
});
handle('shell:openExternal', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
handle('shell:openPath', (p) => shell.openPath(p));
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

// ---------- meta ----------
handle('meta:all', () => ({ devices: meta.DEVICES, countries: meta.COUNTRIES, versions: meta.ANDROID_VERSIONS }));

// ---------- sdk ----------
handle('sdk:status', () => refreshSdk());
handle('sdk:java', () => sdk.findJava(store.settings.javaHome));
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
  if (store.profiles.some((pr) => pr.proxyMode === 'saved' && pr.proxyId === id)) throw new Error('PROXY_IN_USE');
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
  const gid = groupId && store.groups.some((g) => g.id === groupId) ? groupId : null;
  for (const p of store.profiles) if (ids.includes(p.id)) p.groupId = gid;
  store.save();
  return true;
});

handle('profiles:delete', async (ids) => {
  for (const id of ids) {
    await emu.stop(id).catch(() => { /* ignore */ });
    const p = store.profiles.find((x) => x.id === id);
    if (!p) continue;
    avd.deleteAvd(p.avdId, store.settings.avdHome);
    emu.instances.delete(id);
  }
  store.data.profiles = store.profiles.filter((x) => !ids.includes(x.id));
  store.save();
  return true;
});

handle('profiles:start', async (id, opts = {}) => {
  const p = store.profiles.find((x) => x.id === id);
  if (!p) throw new Error('NOT_FOUND');
  refreshSdk();
  if (!sdkStatus.hasEmulator || !sdkStatus.hasAdb) throw new Error('SDK_MISSING');
  if (!avd.avdExists(p.avdId, store.settings.avdHome)) {
    // AVD folder was deleted outside the app: recreate it from the profile.
    const image = sdkStatus.images.find((i) => i.id === p.imageId) || sdkStatus.images[0];
    if (!image) throw new Error('IMAGE_NOT_FOUND');
    avd.createAvd({ avdId: p.avdId, displayName: p.name, image, device: { ...meta.findDevice(p.deviceId), ...p.device, id: p.deviceId }, ram: p.ram, storage: p.storage, home: store.settings.avdHome });
  }
  const proxy = resolveProxy(p);
  return emu.start(p, proxy, { avdHome: store.settings.avdHome, cold: !!opts.cold });
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
