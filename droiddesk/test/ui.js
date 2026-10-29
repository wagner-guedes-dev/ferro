'use strict';
// Renderer smoke test: loads the UI in Chromium with a mocked window.droid API,
// clicks through every screen and fails on any console/page error.
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const MOCK = `
(() => {
  const ok = (data) => Promise.resolve({ ok: true, data });
  const fail = (error) => Promise.resolve({ ok: false, error });
  const listeners = {};
  const on = (ch) => (cb) => { (listeners[ch] = listeners[ch] || []).push(cb); return () => {}; };
  window.__emit = (ch, payload) => (listeners[ch] || []).forEach((cb) => cb(payload));
  const state = {
    settings: { language: 'pt-BR', sdkPath: '', avdHome: '', viewMode: 'grid' },
    groups: [{ id: 'g1', name: 'Loja' }],
    proxies: [{ id: 'px1', name: 'Alemanha', type: 'socks5', host: '1.2.3.4', port: 1080, username: 'u', password: 'p', lastCheck: { ok: true, ip: '5.6.7.8', country: 'Germany', countryCode: 'DE', city: 'Berlin', latency: 120 } }],
    browsers: [],
    profiles: [
      { id: 'p1', serial: 1, name: 'Alema recem monetiz', avdId: 'droiddesk_p1', port: 5554, groupId: null, tags: [], country: 'DE', locale: 'de-DE', timezone: 'Europe/Berlin', device: { manufacturer: 'Google', model: 'Pixel 6', width: 1080, height: 2400, density: 420 }, deviceId: 'pixel_6', ram: 3072, storage: 8, androidVersion: '14', api: 34, abi: 'x86_64', proxyMode: 'saved', proxyId: 'px1', proxy: null, status: 'stopped', deviceName: '', notes: '' },
      { id: 'p2', serial: 2, name: 'Conta Francesa', avdId: 'droiddesk_p2', port: 5556, groupId: 'g1', tags: ['tiktok', 'teste'], country: 'FR', locale: 'fr-FR', timezone: 'Europe/Paris', device: { manufacturer: 'samsung', model: 'SM-S911B', width: 1080, height: 2340, density: 420 }, deviceId: 'galaxy_s23', ram: 4096, storage: 8, androidVersion: '13', api: 33, abi: 'x86_64', proxyMode: 'none', proxyId: null, proxy: null, status: 'running', deviceName: '', notes: '' },
      { id: 'p3', serial: 3, name: 'wagner tiktok gringo', avdId: 'droiddesk_p3', port: 5558, groupId: 'g1', tags: ['usa'], country: 'US', locale: 'en-US', timezone: 'America/New_York', device: { manufacturer: 'Google', model: 'Pixel 8', width: 1080, height: 2400, density: 420 }, deviceId: 'pixel_8', ram: 4096, storage: 8, androidVersion: '14', api: 34, abi: 'x86_64', proxyMode: 'inline', proxyId: null, proxy: { type: 'http', host: 'us.proxy.net', port: 8080, username: '', password: '' }, status: 'stopped', deviceName: '', notes: '' },
    ],
  };
  const sdk = { sdkPath: 'C:\\\\Users\\\\x\\\\AppData\\\\Local\\\\Android\\\\Sdk', emulatorPath: 'C:\\\\...\\\\emulator.exe', adbPath: 'C:\\\\...\\\\adb.exe', hasEmulator: true, hasAdb: true, hasSdkmanager: true, ready: true, hostAbi: 'x86_64', platform: 'win32', arch: 'x64',
    images: [{ id: 'system-images;android-34;google_apis;x86_64', platform: 'android-34', tag: 'google_apis', abi: 'x86_64', api: 34, tagDisplay: 'Google APIs', sysdir: 'system-images/android-34/google_apis/x86_64/', playStore: false }] };
  window.__state = state;
  window.__calls = [];
  const rec = (name, ...a) => { window.__calls.push([name, ...a]); };
  window.droid = {
    app: { info: () => ok({ version: '1.0.0', platform: 'win32', arch: 'x64', dataDir: 'C:\\\\data', avdHome: 'C:\\\\Users\\\\x\\\\.android\\\\avd' }) },
    settings: { get: () => ok(state.settings), set: (p) => { Object.assign(state.settings, p); rec('settings.set', p); return ok(state.settings); } },
    shell: { openExternal: (u) => { rec('openExternal', u); return ok(true); }, openPath: (p) => { rec('openPath', p); return ok(''); } },
    dialog: { pickFolder: () => ok('D:\\\\sdk'), saveFile: (o) => { rec('saveFile', o.defaultPath); return ok('D:\\\\out.json'); }, openFile: () => ok(null) },
    meta: { all: () => ok(__META__) },
    signals: { all: () => ok({}), onSignal: on('signal') },
    update: { status: () => ok({ state: 'idle', version: null, percent: 0, error: '' }), check: () => { setTimeout(() => window.__emit('update:status', { state: 'downloaded', version: '9.9.9', percent: 100, error: '' }), 30); return ok({ state: 'checking' }); }, install: () => { rec('update.install'); return ok(true); }, onStatus: on('update:status') },
    sdk: { status: () => ok(sdk), java: () => ok({ bin: 'java', version: '17.0.9' }), webcams: () => ok([{ id: 'webcam0', device: 'Integrated Camera' }]), install: () => { rec('install'); window.__emit('sdk:log', 'linha de log'); return ok(sdk); }, onLog: on('sdk:log') },
    groups: {
      list: () => ok(state.groups),
      create: (name) => { if (!name.trim()) return fail('INVALID_NAME'); const g = { id: 'g' + Date.now(), name }; state.groups.push(g); return ok(g); },
      rename: (id, name) => { const g = state.groups.find((x) => x.id === id); g.name = name; return ok(g); },
      delete: (id) => { state.groups = state.groups.filter((g) => g.id !== id); state.profiles.forEach((p) => { if (p.groupId === id) p.groupId = null; }); return ok(true); },
    },
    proxies: {
      list: () => ok(state.proxies),
      create: (p) => { if (!p.host) return fail('INVALID_PROXY'); const x = { id: 'px' + Date.now(), lastCheck: null, ...p, name: p.name || (p.host + ':' + p.port) }; state.proxies.push(x); rec('proxies.create', x); return ok(x); },
      bulkCreate: (text) => { const n = text.split('\\n').filter(Boolean).length; for (let i = 0; i < n; i++) state.proxies.push({ id: 'b' + i + Date.now(), name: 'bulk' + i, type: 'http', host: '9.9.9.' + i, port: 80, username: '', password: '', lastCheck: null }); return ok(new Array(n).fill({})); },
      update: (id, p) => { Object.assign(state.proxies.find((x) => x.id === id), p); return ok(true); },
      delete: (id) => { if (state.profiles.some((p) => p.proxyId === id)) return fail('PROXY_IN_USE'); state.proxies = state.proxies.filter((x) => x.id !== id); return ok(true); },
      check: (id) => { const x = state.proxies.find((y) => y.id === id); x.lastCheck = { ok: false, error: 'ECONNREFUSED' }; return ok(x.lastCheck); },
      test: (p) => p.host === 'bad' ? fail('TIMEOUT') : ok({ ip: '1.1.1.1', country: 'Brazil', countryCode: 'BR', city: 'SP', isp: 'ISP', latency: 50, timezone: 'America/Sao_Paulo' }),
      parse: (s) => { const m = s.match(/^([^:]+):(\\d+):([^:]+):(.+)$/); return ok(m ? { type: 'http', host: m[1], port: +m[2], username: m[3], password: m[4] } : null); },
    },
    browsers: {
      detect: () => ok([{ id: 'chrome', name: 'Google Chrome', path: 'C:\\chrome.exe' }, { id: 'edge', name: 'Microsoft Edge', path: 'C:\\msedge.exe' }]),
      list: () => ok(state.browsers),
      create: (p) => { if (!p.name) return fail('INVALID_NAME'); const x = { id: 'b' + Date.now(), serial: 50 + state.browsers.length, status: 'stopped', ...p, width: +p.width, height: +p.height }; state.browsers.push(x); rec('browsers.create', x); return ok(x); },
      update: (id, p) => { Object.assign(state.browsers.find((x) => x.id === id), p); return ok(true); },
      move: (ids, gid) => { state.browsers.forEach((p) => { if (ids.includes(p.id)) p.groupId = gid; }); rec('bmove', ids, gid); return ok(true); },
      delete: (ids) => { state.browsers = state.browsers.filter((p) => !ids.includes(p.id)); return ok(true); },
      start: (id) => { rec('bstart', id); setTimeout(() => window.__emit('browser:status', { profileId: id, status: 'running', detail: '' }), 50); return ok({}); },
      stop: (id) => { setTimeout(() => window.__emit('browser:status', { profileId: id, status: 'stopped', detail: '' }), 50); return ok(true); },
      log: () => ok(['$ chrome ...']), size: () => ok(1), folder: () => ok(true),
      checkProxy: () => ok({ ok: true, direct: true }),
      onStatus: on('browser:status'), onLog: on('browser:log'),
    },
    profiles: {
      list: () => ok(state.profiles),
      statuses: () => ok({}),
      create: (p) => { if (!p.name) return fail('INVALID_NAME'); const x = { id: 'p' + Date.now(), serial: state.profiles.length + 1, avdId: 'x', port: 5560, status: 'stopped', device: { manufacturer: 'Google', model: p.deviceId, width: 1, height: 1, density: 1 }, androidVersion: '14', api: 34, abi: 'x86_64', ...p, ram: +p.ram, storage: +p.storage }; state.profiles.push(x); rec('profiles.create', x); return ok(x); },
      update: (id, p) => { Object.assign(state.profiles.find((x) => x.id === id), p); rec('profiles.update', id, p); return ok(true); },
      move: (ids, gid) => { state.profiles.forEach((p) => { if (ids.includes(p.id)) p.groupId = gid; }); rec('move', ids, gid); return ok(true); },
      delete: (ids) => { state.profiles = state.profiles.filter((p) => !ids.includes(p.id)); rec('delete', ids); return ok(true); },
      start: (id, opts) => { rec('start', id, opts); setTimeout(() => window.__emit('profile:status', { profileId: id, status: 'running', detail: '' }), 50); return ok({ port: 5554 }); },
      stop: (id) => { rec('stop', id); setTimeout(() => window.__emit('profile:status', { profileId: id, status: 'stopped', detail: '' }), 50); return ok(true); },
      log: () => ok(['$ emulator -avd x', 'boot ok']),
      size: () => ok(1024),
      export: (ids) => { rec('export', ids); return ok('[]'); },
      checkProxy: (id) => ok(id === 'p2' ? { ok: true, direct: true } : { ok: true, ip: '5.6.7.8', country: 'Germany', latency: 100 }),
      onStatus: on('profile:status'), onLog: on('profile:log'),
    },
  };
})();
`;

(async () => {
  // Export meta for the mock (served as a static file next to the renderer).
  const meta = require('../src/main/meta');

  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 880 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript(MOCK.replace('__META__', JSON.stringify({ devices: meta.DEVICES, countries: meta.COUNTRIES, versions: meta.ANDROID_VERSIONS })));
  await page.goto('file://' + path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await page.waitForSelector('.card').catch((e) => { console.error('errors so far:', errors); throw e; });
  const outDir = process.env.SHOT_DIR || path.join(__dirname, 'shots');
  require('fs').mkdirSync(outDir, { recursive: true });
  const shot = (n) => page.screenshot({ path: path.join(outDir, `${n}.png`) });

  // 1. grid renders 3 cards, counts and statuses
  assert.strictEqual(await page.locator('.card').count(), 3);
  assert.strictEqual(await page.locator('#count-profiles').innerText(), '3');
  assert.ok((await page.locator('#total-count').innerText()).includes('3'));
  assert.strictEqual(await page.locator('.card .status.running').count(), 1);
  assert.strictEqual(await page.locator('.card .chip.lan').count(), 1);
  await shot('01-profiles');

  // 2. filter by group and text
  await page.selectOption('#filter-group', 'g1');
  assert.strictEqual(await page.locator('.card').count(), 2);
  await page.fill('#filter-text', 'gringo');
  assert.strictEqual(await page.locator('.card').count(), 1);
  await page.fill('#filter-text', '');
  await page.selectOption('#filter-group', 'all');

  // 3. start / stop a profile from card
  await page.locator('.card[data-id="p1"] [data-act="start"]').click();
  await page.waitForSelector('.card[data-id="p1"] .status.running');
  await page.evaluate(() => window.__emit('signal', { key: 'profile:p1', kind: 'profile', profileId: 'p1', quality: 'good', latency: 230, avg: 240, stability: 100, samples: 3 }));
  await page.waitForSelector('.card[data-id="p1"] .sig.q3');
  assert.ok((await page.locator('.card[data-id="p1"] .sig-text').innerText()).includes('230'));
  await page.evaluate(() => window.__emit('signal', { key: 'profile:p1', kind: 'profile', profileId: 'p1', quality: 'down', latency: null, avg: null, stability: 0, samples: 3 }));
  await page.waitForSelector('.card[data-id="p1"] .sig.q0');
  await page.evaluate(() => window.__emit('signal', { key: 'profile:p1', kind: 'profile', profileId: 'p1', quality: 'off' }));
  await page.locator('.card[data-id="p1"] [data-act="stop"]').click();
  await page.waitForSelector('.card[data-id="p1"] .status.stopped');

  // 4. list view
  await page.locator('#view-mode [data-mode="list"]').click();
  await page.waitForSelector('table.list');
  assert.strictEqual(await page.locator('table.list tbody tr').count(), 3);
  await shot('02-list');
  await page.locator('#view-mode [data-mode="grid"]').click();
  await page.waitForSelector('.card').catch((e) => { console.error('errors so far:', errors); throw e; });

  // 5. context menu -> logs
  await page.locator('.card[data-id="p3"] [data-menu]').click();
  await page.waitForSelector('#ctx.open');
  await shot('03-menu');
  await page.locator('#ctx [data-m="logs"]').click();
  await page.waitForSelector('#lg-console');
  assert.ok((await page.locator('#lg-console').innerText()).includes('boot ok'));
  await page.evaluate(() => window.__emit('profile:log', { profileId: 'p3', line: 'live line' }));
  assert.ok((await page.locator('#lg-console').innerText()).includes('live line'));
  await page.locator('#lg-close').click();

  // 6. new profile modal: country auto-fills locale/tz, inline proxy paste+test, create
  await page.locator('#btn-new-profile').click();
  await page.waitForSelector('#pf');
  await page.fill('#pf-name', 'Novo perfil UK');
  await page.selectOption('#pf-country', 'GB');
  assert.strictEqual(await page.inputValue('#pf-locale'), 'en-GB');
  assert.strictEqual(await page.inputValue('#pf-tz'), 'Europe/London');
  await page.selectOption('#pf-device', 'galaxy_s23');
  assert.strictEqual(await page.inputValue('#pf-ram'), '4096');
  await page.locator('label:has(input[name="pf-pmode"][value="inline"])').click();
  await page.fill('#pfx-paste', '10.0.0.1:3128:user:pass');
  await page.locator('#pfx-paste-btn').click();
  assert.strictEqual(await page.inputValue('#pfx-host'), '10.0.0.1');
  assert.strictEqual(await page.inputValue('#pfx-user'), 'user');
  await page.locator('#pfx-test').click();
  await page.waitForSelector('#pfx-result.ok');
  // proxy test detected BR -> country/locale/timezone follow the proxy
  await page.waitForFunction(() => document.querySelector('#pf-country').value === 'BR');
  assert.strictEqual(await page.inputValue('#pf-locale'), 'pt-BR');
  assert.strictEqual(await page.inputValue('#pf-tz'), 'America/Sao_Paulo');
  await shot('04-new-profile');
  await page.fill('#pf-tags', 'uk, teste');
  await page.waitForFunction(() => [...document.querySelectorAll('#pf-cam-front option')].some((o) => o.value === 'webcam0'));
  await page.selectOption('#pf-cam-back', 'webcam0');
  await page.locator('#pf-save').click();
  await page.waitForSelector('.card[data-id^="p"]:nth-child(4)');
  assert.strictEqual(await page.locator('.card').count(), 4);
  const created = await page.evaluate(() => window.__calls.find((c) => c[0] === 'profiles.create')[1]);
  assert.strictEqual(created.proxyMode, 'inline');
  assert.strictEqual(created.proxy.host, '10.0.0.1');
  assert.strictEqual(created.proxy.lastCheck.countryCode, 'BR');
  assert.strictEqual(created.country, 'BR');
  assert.deepStrictEqual(created.tags, ['uk', 'teste']);
  assert.strictEqual(created.imageId, 'system-images;android-34;google_apis;x86_64');
  assert.strictEqual(created.cameraBack, 'webcam0');
  assert.strictEqual(created.cameraFront, 'emulated');

  // 7. edit (double click) keeps hardware locked
  await page.locator('.card[data-id="p2"] .title').dblclick();
  await page.waitForSelector('#pf');
  assert.ok(await page.locator('#pf-device').isDisabled());
  await page.fill('#pf-name', 'Conta Francesa 2');
  await page.locator('#pf-save').click();
  await page.waitForSelector('#modal-bg.open', { state: 'hidden' });
  assert.ok((await page.locator('.card[data-id="p2"] .title').innerText()).includes('Conta Francesa 2'));

  // 8. bulk select -> move to new group
  await page.locator('#select-all').check();
  assert.ok((await page.locator('#selected-count').innerText()).includes('4'));
  await page.locator('[data-bulk="move"]').click();
  await page.waitForSelector('#mv-group');
  await page.fill('#mv-new', 'Grupo novo');
  await page.locator('#mv-add').click();
  await page.waitForFunction(() => document.querySelectorAll('#mv-group option').length === 3);
  await page.locator('#mv-ok').click();
  await page.waitForSelector('#modal-bg.open', { state: 'hidden' });
  const moved = await page.evaluate(() => window.__calls.find((c) => c[0] === 'move'));
  assert.strictEqual(moved[1].length, 4);
  assert.strictEqual(await page.locator('#count-groups').innerText(), '2');

  // 9. bulk delete with confirm, then cancel path
  await page.locator('#select-all').uncheck();
  await page.locator('.card[data-id="p3"] .sel').check();
  await page.locator('[data-bulk="delete"]').click();
  await page.waitForSelector('[data-x="cancel"]');
  assert.ok((await page.locator('#modal li').innerText()).includes('wagner tiktok gringo'));
  await page.locator('[data-x="cancel"]').click();
  assert.strictEqual(await page.locator('.card').count(), 4);
  await page.locator('[data-bulk="delete"]').click();
  await page.waitForSelector('[data-x="ok"]');
  assert.ok(await page.locator('[data-x="ok"]').isDisabled()); // must acknowledge first
  await page.locator('label:has(#cf-ack)').click();
  await page.locator('[data-x="ok"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 3);

  // 10. export & check proxy bulk
  await page.locator('.card[data-id="p1"] .sel').check();
  await page.locator('[data-bulk="export"]').click();
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'saveFile'));
  await page.locator('[data-bulk="checkproxy"]').click();
  await page.waitForSelector('.toast.ok');

  // 10b. browsers view: empty state, create, start/stop, move, delete
  await page.locator('.nav-item[data-view="browsers"]').click();
  await page.waitForSelector('#bempty-new');
  await page.locator('#bempty-new').click();
  await page.waitForSelector('#bf');
  await page.fill('#bf-name', 'Loja Facebook');
  await page.selectOption('#bf-browser', 'edge');
  await page.selectOption('#pf-country', 'DE');
  assert.strictEqual(await page.inputValue('#pf-tz'), 'Europe/Berlin');
  await page.fill('#bf-url', 'https://facebook.com');
  await page.locator('label:has(input[name="pf-pmode"][value="saved"])').click();
  await page.locator('#bf-save').click();
  await page.waitForSelector('.card[data-bid]');
  const bcreated = await page.evaluate(() => window.__calls.find((c) => c[0] === 'browsers.create')[1]);
  assert.strictEqual(bcreated.browserId, 'edge');
  assert.strictEqual(bcreated.proxyMode, 'saved');
  assert.strictEqual(bcreated.proxyId, 'px1');
  assert.strictEqual(bcreated.startUrl, 'https://facebook.com');
  assert.ok((await page.locator('.card[data-bid]').innerText()).includes('Microsoft Edge'));
  await page.locator('.card[data-bid] [data-act="start"]').click();
  await page.waitForSelector('.card[data-bid] .status.running');
  await page.locator('.card[data-bid] [data-act="stop"]').click();
  await page.waitForSelector('.card[data-bid] .status.stopped');
  await page.locator('.card[data-bid] [data-menu]').click();
  await page.locator('#ctx [data-m="logs"]').click();
  await page.waitForFunction(() => document.querySelector('#lg-console') && document.querySelector('#lg-console').innerText.includes('chrome'));
  await page.locator('#lg-close').click();
  await page.locator('#bselect-all').check();
  await page.locator('[data-bbulk="move"]').click();
  await page.waitForSelector('#mv-group');
  await page.selectOption('#mv-group', 'g1');
  await page.locator('#mv-ok').click();
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'bmove'));
  assert.strictEqual(await page.locator('#count-browsers').innerText(), '1');
  await shot('08-browsers');
  await page.locator('.card[data-bid] [data-menu]').click();
  await page.locator('#ctx [data-m="delete"]').click();
  await page.locator('label:has(#cf-ack)').click();
  await page.locator('[data-x="ok"]').click();
  await page.waitForSelector('#bempty-new');

  // 11. proxies view: table, new proxy modal with validation, import, delete in-use error
  await page.locator('.nav-item[data-view="proxies"]').click();
  await page.waitForSelector('table.tbl');
  assert.strictEqual(await page.locator('table.tbl tbody tr').count(), 1);
  await shot('05-proxies');
  await page.locator('#btn-new-proxy').click();
  await page.waitForSelector('#pxf');
  await page.locator('#px-save').click(); // empty host -> error toast
  await page.waitForSelector('.toast.err');
  await page.fill('#px-host', 'bad'); await page.fill('#px-port', '1');
  await page.locator('#px-test').click();
  await page.waitForSelector('#px-result.bad');
  await page.fill('#px-name', 'Meu proxy'); await page.fill('#px-host', 'proxy.x'); await page.fill('#px-port', '8080');
  await page.locator('#px-save').click();
  await page.waitForFunction(() => document.querySelectorAll('table.tbl tbody tr').length === 2);
  await page.locator('#btn-import-proxies').click();
  await page.fill('#im-text', 'a:1\nb:2\nc:3');
  await page.locator('#im-ok').click();
  await page.waitForFunction(() => document.querySelectorAll('table.tbl tbody tr').length === 5);
  await page.locator('tr[data-pid="px1"] [data-px="delete"]').click();
  await page.locator('[data-x="ok"]').click();
  await page.waitForSelector('.toast.err'); // PROXY_IN_USE
  assert.strictEqual(await page.locator('table.tbl tbody tr').count(), 5);
  await page.locator('tr[data-pid="px1"] [data-px="check"]').click();
  await page.waitForSelector('tr[data-pid="px1"] .badge.bad');

  // 12. groups modal: add, rename, delete with inline confirm
  await page.locator('[data-action="groups"]').click();
  await page.waitForSelector('#gr-list');
  await page.fill('#gr-new', 'Terceiro'); await page.press('#gr-new', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#gr-list [data-gid]').length === 3);
  const row = page.locator('#gr-list [data-gid]').first();
  await row.locator('input').fill('Loja renomeada');
  await row.locator('[data-g="rename"]').click();
  await page.waitForFunction(() => document.querySelector('#gr-list [data-gid] input').value === 'Loja renomeada');
  await page.locator('#gr-list [data-gid]').last().locator('[data-g="delete"]').click();
  await page.locator('#gr-list [data-c="y"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#gr-list [data-gid]').length === 2);
  await page.locator('#gr-close').click();

  // 13. settings: java shown, install button logs, language switch to EN
  await page.locator('.nav-item[data-view="settings"]').click();
  await page.waitForSelector('#st-install');
  await page.waitForFunction(() => document.querySelector('#st-java') && document.querySelector('#st-java').innerText.includes('17.0.9'));
  await page.locator('#st-hud').uncheck();
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'settings.set' && c[1].proxyHud === false));
  await page.locator('#upd-check').click();
  await page.waitForSelector('#upd-install');
  await page.waitForFunction(() => document.querySelector('#upd-status').innerText.includes('9.9.9'));
  await page.locator('#upd-install').click();
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'update.install'));
  await page.locator('#st-browse').click();
  await page.waitForFunction(() => document.querySelector('#st-sdk').value === 'D:\\sdk');
  await page.locator('#st-install').click();
  await page.waitForFunction(() => document.querySelector('#st-console') && document.querySelector('#st-console').innerText.includes('linha de log'));
  await shot('06-settings');
  await page.selectOption('#st-lang', 'en');
  await page.waitForFunction(() => document.querySelector('[data-view="profiles"] span[data-i18n]').innerText === 'Profiles');
  await page.locator('.nav-item[data-view="help"]').click();
  await page.waitForFunction(() => document.querySelector('#help-content').innerText.includes('How it works'));
  await page.selectOption('#st-lang', 'pt-BR').catch(() => {});
  await page.locator('.nav-item[data-view="settings"]').click();
  await page.selectOption('#st-lang', 'pt-BR');
  await page.waitForFunction(() => document.querySelector('[data-view="profiles"] span[data-i18n]').innerText === 'Perfis');

  // 14. emulator exit with diagnosis shows translated toast
  await page.locator('.nav-item[data-view="profiles"]').click();
  await page.evaluate(() => window.__emit('profile:status', { profileId: 'p1', status: 'stopped', detail: 'NO_ACCEL' }));
  await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.innerText.includes('aceleração')));

  // 15. empty state when no profiles
  await page.evaluate(() => { window.__state.profiles.length = 0; });
  await page.locator('#btn-refresh').click();
  await page.waitForSelector('#empty-new');
  await shot('07-empty');

  // 16. Escape closes modal; Ctrl+N opens new profile
  await page.keyboard.press('Control+n');
  await page.waitForSelector('#pf');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#modal-bg.open', { state: 'hidden' });

  // 17. HUD page renders updates
  const hudPage = await browser.newPage({ viewport: { width: 200, height: 60 } });
  hudPage.on('pageerror', (e) => errors.push(`hud pageerror: ${e.message}`));
  await hudPage.addInitScript(() => { const cbs = []; window.hud = { onUpdate: (cb) => cbs.push(cb), close: () => { window.__closed = true; } }; window.__push = (d) => cbs.forEach((cb) => cb(d)); });
  await hudPage.goto('file://' + path.join(__dirname, '..', 'src', 'renderer', 'hud.html'));
  await hudPage.evaluate(() => window.__push({ lang: 'pt-BR', name: 'Nerd Anim TikTok', quality: 'good', latency: 230, avg: 240, stability: 100, samples: 4 }));
  assert.ok((await hudPage.locator('#val').innerText()).includes('230 ms'));
  assert.ok(await hudPage.locator('#hud.q3').count() === 1);
  await hudPage.evaluate(() => window.__push({ quality: 'down', latency: null, samples: 4, avg: null, stability: 20 }));
  assert.ok(await hudPage.locator('#hud.q0').count() === 1);
  await hudPage.locator('#close').click();
  assert.strictEqual(await hudPage.evaluate(() => window.__closed), true);
  await hudPage.screenshot({ path: path.join(outDir, '09-hud.png') });

  await browser.close();
  if (errors.length) { console.error('UI errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('UI smoke test passed');
})().catch((e) => { console.error(e); process.exit(1); });
