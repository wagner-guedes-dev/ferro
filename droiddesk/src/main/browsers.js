'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const EventEmitter = require('events');
const { startBridge } = require('./proxy');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// Chromium-based browsers we know how to launch with an isolated profile.
function browserCandidates() {
  const home = os.homedir();
  const list = [];
  const add = (id, name, p) => { if (p && fs.existsSync(p)) list.push({ id, name, path: p }); };
  if (IS_WIN) {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const r of roots) {
      add('chrome', 'Google Chrome', path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      add('edge', 'Microsoft Edge', path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      add('brave', 'Brave', path.join(r, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
      add('chromium', 'Chromium', path.join(r, 'Chromium', 'Application', 'chrome.exe'));
      add('vivaldi', 'Vivaldi', path.join(r, 'Vivaldi', 'Application', 'vivaldi.exe'));
      add('opera', 'Opera', path.join(r, 'Programs', 'Opera', 'opera.exe'));
    }
  } else if (IS_MAC) {
    add('chrome', 'Google Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    add('edge', 'Microsoft Edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    add('brave', 'Brave', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
    add('chromium', 'Chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium');
    add('chrome', 'Google Chrome', path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'));
  } else {
    const bins = [['chrome', 'Google Chrome', 'google-chrome'], ['chrome', 'Google Chrome', 'google-chrome-stable'], ['chromium', 'Chromium', 'chromium'], ['chromium', 'Chromium', 'chromium-browser'], ['edge', 'Microsoft Edge', 'microsoft-edge'], ['brave', 'Brave', 'brave-browser']];
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      for (const [id, name, bin] of bins) add(id, name, path.join(dir, bin));
    }
    add('chrome', 'Google Chrome', '/opt/google/chrome/chrome');
  }
  // De-duplicate by path.
  const seen = new Set();
  return list.filter((b) => { if (seen.has(b.path)) return false; seen.add(b.path); return true; });
}

function detectBrowsers(customPath) {
  const list = browserCandidates();
  if (customPath && fs.existsSync(customPath)) list.unshift({ id: 'custom', name: path.basename(customPath), path: customPath });
  return list;
}

/**
 * Build the command line for an isolated browser profile.
 */
function buildArgs(profile, { dataDir, bridgePort }) {
  const args = [
    `--user-data-dir=${dataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    `--lang=${profile.locale || 'en-US'}`,
  ];
  if (bridgePort) {
    args.push(`--proxy-server=http://127.0.0.1:${bridgePort}`);
    // Keep WebRTC from using non-proxied UDP routes (Chrome's own privacy policy).
    args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  }
  if (profile.width && profile.height) args.push(`--window-size=${profile.width},${profile.height}`);
  if (profile.startUrl) args.push(profile.startUrl);
  return args;
}

class BrowserManager extends EventEmitter {
  constructor() {
    super();
    this.instances = new Map();
  }

  statusOf(id) { const i = this.instances.get(id); return i ? i.status : 'stopped'; }

  allStatuses() {
    const out = {};
    for (const [id, i] of this.instances) out[id] = { status: i.status, bridgePort: i.bridge ? i.bridge.port : null };
    return out;
  }

  _set(inst, status, detail) { inst.status = status; this.emit('status', { profileId: inst.profileId, status, detail: detail || '' }); }
  _log(inst, line) { inst.log.push(line); if (inst.log.length > 300) inst.log.shift(); this.emit('log', { profileId: inst.profileId, line }); }

  async start(profile, proxy, { browserPath, dataDir }) {
    if (!browserPath || !fs.existsSync(browserPath)) throw new Error('BROWSER_MISSING');
    if (this.instances.has(profile.id) && this.instances.get(profile.id).status !== 'stopped') throw new Error('ALREADY_RUNNING');
    const inst = { profileId: profile.id, status: 'starting', child: null, bridge: null, log: [], startedAt: Date.now(), proxy: proxy || null };
    this.instances.set(profile.id, inst);
    this._set(inst, 'starting');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      if (proxy) {
        inst.bridge = await startBridge(proxy);
        this._log(inst, `Ponte de proxy ativa em 127.0.0.1:${inst.bridge.port} -> ${proxy.type}://${proxy.host}:${proxy.port}`);
      }
      const args = buildArgs(profile, { dataDir, bridgePort: inst.bridge ? inst.bridge.port : null });
      const env = { ...process.env };
      if (profile.timezone) env.TZ = profile.timezone;
      this._log(inst, `$ "${browserPath}" ${args.join(' ')}`);
      const child = spawn(browserPath, args, { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'], detached: !IS_WIN });
      inst.child = child;
      const onOut = (c) => { for (const l of String(c).split(/\r?\n/)) if (l.trim()) this._log(inst, l.trim()); };
      child.stdout.on('data', onOut);
      child.stderr.on('data', onOut);
      child.stdout.on('error', () => {});
      child.stderr.on('error', () => {});
      child.on('error', (err) => { this._log(inst, `Erro ao iniciar navegador: ${err.message}`); this._cleanup(inst, 'spawn'); });
      child.on('exit', (code) => { this._log(inst, `Navegador fechado (code=${code}).`); this._cleanup(inst, inst.status === 'stopping' || code === 0 || code === null ? '' : 'EXITED'); });
      setTimeout(() => { if (inst.status === 'starting') this._set(inst, 'running'); }, 1500);
      return { bridgePort: inst.bridge ? inst.bridge.port : null };
    } catch (err) {
      await this._cleanup(inst, err.message);
      throw err;
    }
  }

  async stop(id) {
    const inst = this.instances.get(id);
    if (!inst || inst.status === 'stopped') return;
    this._set(inst, 'stopping');
    if (inst.child && inst.child.exitCode === null) {
      try {
        if (IS_WIN) spawn('taskkill', ['/PID', String(inst.child.pid), '/T', '/F'], { windowsHide: true });
        else process.kill(-inst.child.pid, 'SIGTERM');
      } catch (_) { try { inst.child.kill('SIGKILL'); } catch (_2) { /* ignore */ } }
      await new Promise((r) => { const t0 = Date.now(); const tick = () => { if (inst.status === 'stopped' || inst.child.exitCode !== null || Date.now() - t0 > 8000) return r(); setTimeout(tick, 200); }; tick(); });
    }
    if (inst.status !== 'stopped') await this._cleanup(inst, '');
  }

  async _cleanup(inst, detail) {
    if (inst.bridge) { try { await inst.bridge.close(); } catch (_) { /* ignore */ } inst.bridge = null; }
    if (inst.status !== 'stopped') this._set(inst, 'stopped', detail || '');
  }

  async stopAll() { await Promise.all([...this.instances.keys()].map((id) => this.stop(id).catch(() => {}))); }
  getLog(id) { const i = this.instances.get(id); return i ? i.log.slice() : []; }
}

function dirSize(dir) {
  let total = 0;
  const walk = (d) => { let names = []; try { names = fs.readdirSync(d); } catch (_) { return; } for (const n of names) { const p = path.join(d, n); try { const st = fs.statSync(p); if (st.isDirectory()) walk(p); else total += st.size; } catch (_) { /* ignore */ } } };
  walk(dir);
  return total;
}

module.exports = { detectBrowsers, buildArgs, BrowserManager, dirSize, execFile };
