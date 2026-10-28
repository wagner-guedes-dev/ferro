'use strict';
// Backend tests: run with `npm test`. No Electron needed.
const assert = require('assert');
const net = require('net');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { openTunnel, startBridge, checkProxy, parseProxyString } = require('../src/main/proxy');
const { Store } = require('../src/main/store');
const avd = require('../src/main/avd');
const sdk = require('../src/main/sdk');
const meta = require('../src/main/meta');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------- helpers: tiny SOCKS5 server and HTTP CONNECT proxy for tests ----------
function startSocks5(auth) {
  return new Promise((resolve) => {
    const seen = { connects: 0, authed: false };
    const server = net.createServer((client) => {
      let stage = 0;
      client.on('data', (buf) => {
        if (stage === 0) {
          // greeting
          const method = auth ? 0x02 : 0x00;
          client.write(Buffer.from([0x05, method]));
          stage = auth ? 1 : 2;
        } else if (stage === 1) {
          // username/password auth
          const ulen = buf[1]; const user = buf.slice(2, 2 + ulen).toString();
          const plen = buf[2 + ulen]; const pass = buf.slice(3 + ulen, 3 + ulen + plen).toString();
          const ok = user === auth.user && pass === auth.pass;
          seen.authed = ok;
          client.write(Buffer.from([0x01, ok ? 0x00 : 0x01]));
          if (!ok) client.end(); else stage = 2;
        } else if (stage === 2) {
          // connect request
          let host; let off;
          if (buf[3] === 0x01) { host = [...buf.slice(4, 8)].join('.'); off = 8; }
          else if (buf[3] === 0x03) { const l = buf[4]; host = buf.slice(5, 5 + l).toString(); off = 5 + l; }
          else { client.end(); return; }
          const port = buf.readUInt16BE(off);
          seen.connects++;
          const up = net.connect(port, host, () => {
            client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            up.pipe(client); client.pipe(up);
          });
          up.on('error', () => client.destroy());
          stage = 3;
        }
      });
      client.on('error', () => {});
    });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, seen, close: () => server.close() }));
  });
}

function startHttpProxy(auth) {
  return new Promise((resolve) => {
    const seen = { connects: 0, requests: 0 };
    const server = http.createServer((req, res) => {
      seen.requests++;
      if (auth && req.headers['proxy-authorization'] !== `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}`) { res.writeHead(407); return res.end(); }
      const u = new URL(req.url);
      const up = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      req.pipe(up);
    });
    server.on('connect', (req, socket, head) => {
      if (auth && req.headers['proxy-authorization'] !== `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}`) { socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); return; }
      seen.connects++;
      const [host, port] = req.url.split(':');
      const up = net.connect(Number(port), host, () => { socket.write('HTTP/1.1 200 OK\r\n\r\n'); if (head.length) up.write(head); up.pipe(socket); socket.pipe(up); });
      up.on('error', () => socket.destroy());
    });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, seen, close: () => server.close() }));
  });
}

function startOrigin() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/json/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'success', country: 'Brazil', countryCode: 'BR', city: 'Sao Paulo', timezone: 'America/Sao_Paulo', query: '200.1.2.3', isp: 'Test ISP' }));
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`hello ${req.method} ${req.url} ${req.headers['x-test'] || ''}`);
    });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }));
  });
}

function rawGet(sock, host, pathName) {
  return new Promise((resolve, reject) => {
    let data = '';
    sock.on('data', (c) => { data += c; });
    sock.on('end', () => resolve(data));
    sock.on('error', reject);
    sock.write(`GET ${pathName} HTTP/1.1\r\nHost: ${host}\r\nX-Test: ok\r\nConnection: close\r\n\r\n`);
  });
}

function httpViaProxy(proxyPort, url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: proxyPort, path: url, method, headers: { 'X-Test': 'via' } }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject); req.end();
  });
}

function connectViaProxy(proxyPort, host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect(proxyPort, '127.0.0.1', () => {
      s.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
      let buf = '';
      const onData = (c) => {
        buf += c; const i = buf.indexOf('\r\n\r\n');
        if (i === -1) return;
        s.removeListener('data', onData);
        const status = parseInt(buf.match(/HTTP\/1\.1 (\d+)/)[1], 10);
        if (status !== 200) return reject(new Error(`CONNECT ${status}`));
        resolve(s);
      };
      s.on('data', onData);
    });
    s.on('error', reject);
  });
}

// ---------- proxy tests ----------
test('parseProxyString handles all formats', () => {
  assert.deepStrictEqual(parseProxyString('1.2.3.4:8080'), { type: 'http', host: '1.2.3.4', port: 8080, username: '', password: '' });
  assert.deepStrictEqual(parseProxyString('1.2.3.4:8080:u:p'), { type: 'http', host: '1.2.3.4', port: 8080, username: 'u', password: 'p' });
  assert.deepStrictEqual(parseProxyString('u:p@host.com:1080'), { type: 'http', host: 'host.com', port: 1080, username: 'u', password: 'p' });
  assert.deepStrictEqual(parseProxyString('socks5://u:p@host.com:1080'), { type: 'socks5', host: 'host.com', port: 1080, username: 'u', password: 'p' });
  assert.deepStrictEqual(parseProxyString('https://host.com:443'), { type: 'https', host: 'host.com', port: 443, username: '', password: '' });
  assert.deepStrictEqual(parseProxyString('socks://host.com:1080'), { type: 'socks5', host: 'host.com', port: 1080, username: '', password: '' });
  assert.strictEqual(parseProxyString('garbage'), null);
  assert.strictEqual(parseProxyString(''), null);
  assert.strictEqual(parseProxyString('host:notaport'), null);
});

test('openTunnel direct', async () => {
  const origin = await startOrigin();
  const sock = await openTunnel({ type: 'none' }, '127.0.0.1', origin.port);
  const res = await rawGet(sock, '127.0.0.1', '/direct');
  assert.ok(res.includes('hello GET /direct ok'));
  origin.close();
});

test('openTunnel through SOCKS5 with auth', async () => {
  const origin = await startOrigin();
  const socks = await startSocks5({ user: 'alice', pass: 's3cret' });
  const sock = await openTunnel({ type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'alice', password: 's3cret' }, '127.0.0.1', origin.port);
  const res = await rawGet(sock, '127.0.0.1', '/socks');
  assert.ok(res.includes('hello GET /socks ok'));
  assert.strictEqual(socks.seen.connects, 1);
  assert.strictEqual(socks.seen.authed, true);
  await assert.rejects(openTunnel({ type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'alice', password: 'wrong' }, '127.0.0.1', origin.port));
  origin.close(); socks.close();
});

test('openTunnel through HTTP proxy with auth (CONNECT)', async () => {
  const origin = await startOrigin();
  const hp = await startHttpProxy({ user: 'bob', pass: 'pw' });
  const sock = await openTunnel({ type: 'http', host: '127.0.0.1', port: hp.port, username: 'bob', password: 'pw' }, '127.0.0.1', origin.port);
  const res = await rawGet(sock, '127.0.0.1', '/http');
  assert.ok(res.includes('hello GET /http ok'));
  assert.strictEqual(hp.seen.connects, 1);
  await assert.rejects(openTunnel({ type: 'http', host: '127.0.0.1', port: hp.port, username: 'bob', password: 'bad' }, '127.0.0.1', origin.port), /PROXY_AUTH/);
  await assert.rejects(openTunnel({ type: 'http', host: '127.0.0.1', port: 1, username: '', password: '' }, '127.0.0.1', origin.port));
  origin.close(); hp.close();
});

test('bridge forwards CONNECT and plain HTTP through SOCKS5', async () => {
  const origin = await startOrigin();
  const socks = await startSocks5(null);
  const bridge = await startBridge({ type: 'socks5', host: '127.0.0.1', port: socks.port });
  assert.ok(bridge.port > 0);
  // plain HTTP (absolute URL)
  const r = await httpViaProxy(bridge.port, `http://127.0.0.1:${origin.port}/plain?x=1`);
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.includes('hello GET /plain?x=1 via'));
  // CONNECT tunnel
  const tunnel = await connectViaProxy(bridge.port, '127.0.0.1', origin.port);
  const res = await rawGet(tunnel, '127.0.0.1', '/tunnel');
  assert.ok(res.includes('hello GET /tunnel ok'));
  assert.strictEqual(socks.seen.connects, 2);
  assert.ok(bridge.stats.bytesIn > 0 && bridge.stats.connections === 2);
  // relative URL is rejected cleanly
  const bad = await httpViaProxy(bridge.port, '/relative');
  assert.strictEqual(bad.status, 400);
  await bridge.close(); origin.close(); socks.close();
});

test('bridge returns 502 when upstream is down', async () => {
  const bridge = await startBridge({ type: 'http', host: '127.0.0.1', port: 1 });
  const r = await httpViaProxy(bridge.port, 'http://127.0.0.1:9/x');
  assert.strictEqual(r.status, 502);
  await assert.rejects(connectViaProxy(bridge.port, '127.0.0.1', 9), /CONNECT 502/);
  assert.strictEqual(bridge.stats.errors, 2);
  await bridge.close();
});

test('bridge chained through HTTP proxy with auth', async () => {
  const origin = await startOrigin();
  const hp = await startHttpProxy({ user: 'u', pass: 'p' });
  const bridge = await startBridge({ type: 'http', host: '127.0.0.1', port: hp.port, username: 'u', password: 'p' });
  const r = await httpViaProxy(bridge.port, `http://127.0.0.1:${origin.port}/chain`);
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.includes('/chain via'));
  const tunnel = await connectViaProxy(bridge.port, '127.0.0.1', origin.port);
  assert.ok((await rawGet(tunnel, '127.0.0.1', '/t2')).includes('/t2 ok'));
  await bridge.close(); origin.close(); hp.close();
});

test('checkProxy parses geo response (via local origin on port 80 substitute)', async () => {
  // checkProxy always targets ip-api.com:80; use a fake "proxy" that redirects any destination to our origin.
  const origin = await startOrigin();
  const fakeSocks = await startSocks5(null);
  // Monkey-patch destination by routing through a socks server that ignores host and connects to origin.
  const server = net.createServer((client) => {
    let stage = 0;
    client.on('data', (buf) => {
      if (stage === 0) { client.write(Buffer.from([5, 0])); stage = 1; }
      else if (stage === 1) {
        const up = net.connect(origin.port, '127.0.0.1', () => { client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])); up.pipe(client); client.pipe(up); });
        stage = 2;
      }
    });
    client.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const res = await checkProxy({ type: 'socks5', host: '127.0.0.1', port: server.address().port });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.countryCode, 'BR');
  assert.strictEqual(res.ip, '200.1.2.3');
  assert.ok(res.latency >= 0);
  server.close(); origin.close(); fakeSocks.close();
});

// ---------- store ----------
test('store persists atomically and allocates ports', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-store-'));
  const file = path.join(dir, 'sub', 'data.json');
  const s = new Store(file);
  assert.strictEqual(s.allocatePort(), 5554);
  s.profiles.push({ id: 'a', port: 5554 });
  assert.strictEqual(s.allocatePort(), 5556);
  assert.strictEqual(s.nextSerial(), 1);
  assert.strictEqual(s.nextSerial(), 2);
  s.setSettings({ language: 'en' });
  const s2 = new Store(file);
  assert.strictEqual(s2.settings.language, 'en');
  assert.strictEqual(s2.profiles.length, 1);
  assert.strictEqual(s2.settings.nextSerial, 3);
  fs.writeFileSync(file, '{not json');
  const s3 = new Store(file);
  assert.strictEqual(s3.profiles.length, 0);
  assert.ok(fs.readdirSync(path.dirname(file)).some((n) => n.includes('corrupt')));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- avd ----------
test('avd create/update/delete writes correct ini files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-avd-'));
  const image = { id: 'system-images;android-34;google_apis;x86_64', platform: 'android-34', tag: 'google_apis', abi: 'x86_64', api: 34, tagDisplay: 'Google APIs', sysdir: 'system-images/android-34/google_apis/x86_64/', playStore: false };
  const device = meta.findDevice('galaxy_s23');
  avd.createAvd({ avdId: 'droiddesk_test', displayName: 'Teste', image, device, ram: 3072, storage: 8, home });
  assert.ok(avd.avdExists('droiddesk_test', home));
  const cfg = fs.readFileSync(path.join(home, 'droiddesk_test.avd', 'config.ini'), 'utf8');
  assert.ok(cfg.includes('hw.lcd.width=1080'));
  assert.ok(cfg.includes('hw.lcd.height=2340'));
  assert.ok(cfg.includes('hw.ramSize=3072'));
  assert.ok(cfg.includes('image.sysdir.1=system-images/android-34/google_apis/x86_64/'));
  assert.ok(cfg.includes('hw.cpu.arch=x86_64'));
  assert.ok(cfg.includes('disk.dataPartition.size=8G'));
  assert.ok(cfg.includes('avd.ini.displayname=Teste'));
  const ini = fs.readFileSync(path.join(home, 'droiddesk_test.ini'), 'utf8');
  assert.ok(ini.includes('target=android-34'));
  avd.updateDisplayName('droiddesk_test', 'Novo nome', home);
  const cfg2 = fs.readFileSync(path.join(home, 'droiddesk_test.avd', 'config.ini'), 'utf8');
  assert.ok(cfg2.includes('avd.ini.displayname=Novo nome'));
  assert.ok(!cfg2.includes('displayname=Teste'));
  assert.ok(avd.avdSizeBytes('droiddesk_test', home) > 0);
  avd.deleteAvd('droiddesk_test', home);
  assert.ok(!avd.avdExists('droiddesk_test', home));
  // arm64 image -> arm64 cpu arch
  avd.createAvd({ avdId: 'arm', displayName: 'arm', image: { ...image, abi: 'arm64-v8a' }, device, home });
  assert.ok(fs.readFileSync(path.join(home, 'arm.avd', 'config.ini'), 'utf8').includes('hw.cpu.arch=arm64'));
  fs.rmSync(home, { recursive: true, force: true });
});

// ---------- sdk ----------
test('sdk detects fake SDK tree and lists images', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-sdk-'));
  const exeName = process.platform === 'win32' ? 'emulator.exe' : 'emulator';
  fs.mkdirSync(path.join(root, 'emulator'), { recursive: true });
  fs.writeFileSync(path.join(root, 'emulator', exeName), '');
  fs.mkdirSync(path.join(root, 'platform-tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'), '');
  const img = path.join(root, 'system-images', 'android-34', 'google_apis', 'x86_64');
  fs.mkdirSync(img, { recursive: true });
  fs.writeFileSync(path.join(img, 'system.img'), '');
  fs.writeFileSync(path.join(img, 'source.properties'), 'AndroidVersion.ApiLevel=34\nSystemImage.TagId=google_apis\nSystemImage.TagDisplay=Google APIs\nSystemImage.Abi=x86_64\n');
  const img2 = path.join(root, 'system-images', 'android-30', 'google_apis_playstore', 'x86');
  fs.mkdirSync(img2, { recursive: true });
  fs.writeFileSync(path.join(img2, 'system.img'), '');
  // incomplete image (no system.img) must be ignored
  fs.mkdirSync(path.join(root, 'system-images', 'android-33', 'default', 'x86_64'), { recursive: true });
  const st = sdk.getStatus(root);
  assert.strictEqual(st.sdkPath, root);
  assert.strictEqual(st.hasEmulator, true);
  assert.strictEqual(st.hasAdb, true);
  assert.strictEqual(st.ready, true);
  assert.strictEqual(st.images.length, 2);
  assert.strictEqual(st.images[0].api, 34);
  assert.strictEqual(st.images[0].tagDisplay, 'Google APIs');
  assert.strictEqual(st.images[1].api, 30);
  assert.strictEqual(st.images[1].playStore, true);
  const missing = sdk.getStatus(path.join(root, 'nope'));
  assert.strictEqual(missing.ready, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('meta helpers', () => {
  assert.strictEqual(meta.androidVersionName(34), '14');
  assert.strictEqual(meta.androidVersionName(99), 'API 99');
  assert.strictEqual(meta.findCountry('XX').code, 'BR');
  assert.strictEqual(meta.findDevice('nope').id, 'pixel_6');
  assert.ok(meta.COUNTRIES.every((c) => c.locale && c.timezone && c.flag && Number.isFinite(c.lat) && Number.isFinite(c.lon)));
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('test timeout')), 15000))]);
      console.log(`✔ ${name}`);
    } catch (err) {
      failed++;
      console.log(`✖ ${name}\n   ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n   ') : err}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
