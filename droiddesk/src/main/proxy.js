'use strict';
const net = require('net');
const tls = require('tls');
const http = require('http');
const { SocksClient } = require('socks');

const TIMEOUT = 20000;

function basicAuth(p) {
  return `Basic ${Buffer.from(`${p.username || ''}:${p.password || ''}`).toString('base64')}`;
}

/**
 * Open a TCP tunnel to host:port through the upstream proxy.
 * Supported proxy.type: 'none' | 'http' | 'https' | 'socks5' | 'socks4'
 * Resolves with a connected socket.
 */
function openTunnel(proxy, host, port) {
  port = Number(port);
  if (!proxy || proxy.type === 'none') {
    return new Promise((resolve, reject) => {
      const s = net.connect({ host, port });
      s.setTimeout(TIMEOUT, () => s.destroy(new Error('TIMEOUT')));
      s.once('connect', () => { s.setTimeout(0); resolve(s); });
      s.once('error', reject);
    });
  }
  if (proxy.type === 'socks5' || proxy.type === 'socks4') {
    return SocksClient.createConnection({
      command: 'connect',
      timeout: TIMEOUT,
      proxy: {
        host: proxy.host,
        port: Number(proxy.port),
        type: proxy.type === 'socks4' ? 4 : 5,
        userId: proxy.username || undefined,
        password: proxy.password || undefined,
      },
      destination: { host, port },
    }).then((info) => info.socket);
  }
  // HTTP / HTTPS proxy using CONNECT.
  return new Promise((resolve, reject) => {
    const opts = { host: proxy.host, port: Number(proxy.port) };
    const sock = proxy.type === 'https'
      ? tls.connect({ ...opts, servername: proxy.host, rejectUnauthorized: false })
      : net.connect(opts);
    let buf = '';
    let done = false;
    const fail = (err) => { if (!done) { done = true; sock.destroy(); reject(err); } };
    sock.setTimeout(TIMEOUT, () => fail(new Error('TIMEOUT')));
    sock.once('error', fail);
    sock.once(proxy.type === 'https' ? 'secureConnect' : 'connect', () => {
      let req = `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n`;
      if (proxy.username) req += `Proxy-Authorization: ${basicAuth(proxy)}\r\n`;
      req += '\r\n';
      sock.write(req);
    });
    const onData = (chunk) => {
      buf += chunk.toString('latin1');
      const end = buf.indexOf('\r\n\r\n');
      if (end === -1) { if (buf.length > 65536) fail(new Error('BAD_PROXY_RESPONSE')); return; }
      sock.removeListener('data', onData);
      const status = parseInt((buf.match(/^HTTP\/\d\.\d (\d{3})/) || [])[1], 10);
      if (status !== 200) return fail(new Error(status === 407 ? 'PROXY_AUTH' : `PROXY_HTTP_${status || 'ERR'}`));
      done = true;
      sock.setTimeout(0);
      sock.removeListener('error', fail);
      const rest = Buffer.from(buf.slice(end + 4), 'latin1');
      if (rest.length) sock.unshift(rest);
      resolve(sock);
    };
    sock.on('data', onData);
  });
}

/**
 * Local HTTP proxy (CONNECT + plain HTTP) that forwards everything through
 * the upstream proxy. The Android emulator only speaks plain HTTP proxy
 * without SOCKS support, so this bridge gives every profile SOCKS5/HTTPS/auth
 * support transparently.
 */
function startBridge(proxy, { host = '127.0.0.1', port = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const stats = { bytesIn: 0, bytesOut: 0, connections: 0, errors: 0 };
    const server = http.createServer();
    server.on('connect', (req, clientSocket, head) => {
      const idx = req.url.lastIndexOf(':');
      const host = idx > 0 ? req.url.slice(0, idx) : req.url;
      const port = idx > 0 ? parseInt(req.url.slice(idx + 1), 10) : 443;
      stats.connections++;
      clientSocket.on('error', () => { /* client closed */ });
      openTunnel(proxy, host.replace(/^\[|\]$/g, ''), port).then((up) => {
        if (clientSocket.destroyed) { up.destroy(); return; }
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) up.write(head);
        up.on('data', (c) => { stats.bytesIn += c.length; });
        clientSocket.on('data', (c) => { stats.bytesOut += c.length; });
        up.pipe(clientSocket);
        clientSocket.pipe(up);
        up.on('error', () => clientSocket.destroy());
        up.on('close', () => clientSocket.destroy());
        clientSocket.on('close', () => up.destroy());
      }).catch(() => {
        stats.errors++;
        if (!clientSocket.destroyed) clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
      });
    });
    server.on('request', (req, res) => {
      let url;
      try { url = new URL(req.url); } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('DroidDesk proxy bridge: absolute URL required');
      }
      stats.connections++;
      const headers = { ...req.headers };
      delete headers['proxy-connection'];
      delete headers['proxy-authorization'];
      headers.connection = 'close';
      const target = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
      openTunnel(proxy, url.hostname, target).then((up) => {
        const upReq = http.request({
          createConnection: () => up,
          host: url.hostname,
          port: target,
          method: req.method,
          path: url.pathname + url.search,
          headers,
          agent: false,
        }, (upRes) => {
          res.writeHead(upRes.statusCode, upRes.headers);
          upRes.on('data', (c) => { stats.bytesIn += c.length; });
          upRes.pipe(res);
        });
        upReq.on('error', () => { stats.errors++; if (!res.headersSent) res.writeHead(502); res.end(); });
        req.on('data', (c) => { stats.bytesOut += c.length; });
        req.pipe(upReq);
      }).catch(() => {
        stats.errors++;
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('DroidDesk: upstream proxy unreachable');
      });
    });
    server.on('clientError', (err, socket) => { if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({
        port: server.address().port,
        host,
        stats,
        close: () => new Promise((r) => { server.close(() => r()); server.closeAllConnections && server.closeAllConnections(); }),
      });
    });
  });
}

/**
 * Check a proxy: fetch public IP + geo info through it.
 */
async function checkProxy(proxy) {
  const started = Date.now();
  const host = 'ip-api.com';
  const sock = await openTunnel(proxy, host, 80);
  const body = await new Promise((resolve, reject) => {
    let data = '';
    sock.setTimeout(TIMEOUT, () => sock.destroy(new Error('TIMEOUT')));
    sock.on('data', (c) => { data += c.toString('utf8'); });
    sock.on('error', reject);
    sock.on('close', () => resolve(data));
    sock.write(`GET /json/?fields=status,message,country,countryCode,city,timezone,query,isp,lat,lon HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: DroidDesk\r\nConnection: close\r\n\r\n`);
  });
  const sep = body.indexOf('\r\n\r\n');
  if (sep === -1) throw new Error('BAD_RESPONSE');
  const status = parseInt((body.match(/^HTTP\/\d\.\d (\d{3})/) || [])[1], 10);
  if (status !== 200) throw new Error(`HTTP_${status}`);
  let payload = body.slice(sep + 4);
  // Strip chunked encoding if present.
  if (/transfer-encoding:\s*chunked/i.test(body.slice(0, sep))) {
    let out = '';
    let rest = payload;
    while (rest.length) {
      const nl = rest.indexOf('\r\n');
      if (nl === -1) break;
      const size = parseInt(rest.slice(0, nl), 16);
      if (!size) break;
      out += rest.slice(nl + 2, nl + 2 + size);
      rest = rest.slice(nl + 2 + size + 2);
    }
    payload = out;
  }
  const json = JSON.parse(payload.trim());
  if (json.status !== 'success') throw new Error(json.message || 'LOOKUP_FAILED');
  return {
    ok: true,
    ip: json.query,
    country: json.country,
    countryCode: json.countryCode,
    city: json.city,
    timezone: json.timezone,
    isp: json.isp,
    lat: typeof json.lat === 'number' ? json.lat : null,
    lon: typeof json.lon === 'number' ? json.lon : null,
    latency: Date.now() - started,
    checkedAt: new Date().toISOString(),
  };
}

// Parse "host:port", "host:port:user:pass", "user:pass@host:port", "socks5://user:pass@host:port".
function parseProxyString(str) {
  str = String(str || '').trim();
  if (!str) return null;
  let type = 'http';
  const m = str.match(/^(https?|socks5|socks4|socks):\/\/(.*)$/i);
  if (m) { type = m[1].toLowerCase() === 'socks' ? 'socks5' : m[1].toLowerCase(); str = m[2]; }
  let username = '';
  let password = '';
  let host;
  let port;
  if (str.includes('@')) {
    const at = str.lastIndexOf('@');
    const creds = str.slice(0, at);
    const hp = str.slice(at + 1);
    [username, password = ''] = creds.split(':');
    [host, port] = hp.split(':');
  } else {
    const parts = str.split(':');
    if (parts.length >= 4) { [host, port, username, password] = parts; }
    else { [host, port] = parts; }
  }
  port = parseInt(port, 10);
  if (!host || !Number.isFinite(port)) return null;
  return { type, host, port, username: username || '', password: password || '' };
}

/**
 * Quick round-trip measurement through the proxy (HEAD generate_204).
 */
function pingProxy(proxy, timeout = 8000) {
  const started = Date.now();
  const host = 'connectivitycheck.gstatic.com';
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve({ ok, latency: Date.now() - started, at: Date.now() }); };
    const timer = setTimeout(() => finish(false), timeout);
    openTunnel(proxy, host, 80).then((sock) => {
      sock.setTimeout(timeout, () => sock.destroy());
      sock.on('data', (c) => { if (/^HTTP\/\d/.test(String(c))) { clearTimeout(timer); finish(true); sock.destroy(); } });
      sock.on('error', () => { clearTimeout(timer); finish(false); });
      sock.on('close', () => { clearTimeout(timer); finish(false); });
      sock.write(`HEAD /generate_204 HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    }).catch(() => { clearTimeout(timer); finish(false); });
  });
}

module.exports = { openTunnel, startBridge, checkProxy, parseProxyString, pingProxy };
