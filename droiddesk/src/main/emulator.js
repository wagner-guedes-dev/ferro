'use strict';
const { spawn, execFile } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { startBridge } = require('./proxy');
const { avdHome } = require('./avd');

const IS_WIN = process.platform === 'win32';

/**
 * Manages running emulator instances. One instance per profile.
 * Emits 'status' ({ profileId, status, detail }) and 'log' ({ profileId, line }).
 */
class EmulatorManager extends EventEmitter {
  constructor() {
    super();
    this.instances = new Map(); // profileId -> instance
    this.sdk = null;
  }

  setSdk(sdkStatus) { this.sdk = sdkStatus; }

  statusOf(profileId) {
    const i = this.instances.get(profileId);
    return i ? i.status : 'stopped';
  }

  allStatuses() {
    const out = {};
    for (const [id, i] of this.instances) out[id] = { status: i.status, bridgePort: i.bridge ? i.bridge.port : null, stats: i.bridge ? i.bridge.stats : null };
    return out;
  }

  _set(inst, status, detail) {
    inst.status = status;
    this.emit('status', { profileId: inst.profileId, status, detail: detail || '' });
  }

  _log(inst, line) {
    inst.log.push(line);
    if (inst.log.length > 400) inst.log.shift();
    this.emit('log', { profileId: inst.profileId, line });
  }

  adb(args, opts = {}) {
    return new Promise((resolve, reject) => {
      if (!this.sdk || !this.sdk.hasAdb) return reject(new Error('ADB_MISSING'));
      execFile(this.sdk.adbPath, args, { windowsHide: true, timeout: opts.timeout || 15000, env: this._env() }, (err, stdout, stderr) => {
        if (err) return reject(Object.assign(err, { stdout, stderr }));
        resolve(String(stdout));
      });
    });
  }

  _env() {
    const env = { ...process.env };
    if (this.sdk) { env.ANDROID_HOME = this.sdk.sdkPath; env.ANDROID_SDK_ROOT = this.sdk.sdkPath; }
    if (this.customAvdHome) env.ANDROID_AVD_HOME = this.customAvdHome;
    return env;
  }

  /**
   * @param {object} profile  stored profile
   * @param {object|null} proxy  resolved proxy object or null
   * @param {object} opts { avdHome, cold }
   */
  async start(profile, proxy, opts = {}) {
    if (!this.sdk || !this.sdk.hasEmulator) throw new Error('SDK_MISSING');
    if (this.instances.has(profile.id) && this.instances.get(profile.id).status !== 'stopped') throw new Error('ALREADY_RUNNING');
    this.customAvdHome = opts.avdHome || '';
    const inst = { profileId: profile.id, status: 'starting', child: null, bridge: null, log: [], port: profile.port, startedAt: Date.now() };
    this.instances.set(profile.id, inst);
    this._set(inst, 'starting');

    const args = ['-avd', profile.avdId, '-port', String(profile.port), '-no-boot-anim', '-netdelay', 'none', '-netspeed', 'full'];
    if (opts.cold) args.push('-no-snapshot-load');
    if (profile.timezone) args.push('-timezone', profile.timezone);
    if (profile.locale) args.push('-change-locale', profile.locale.replace('_', '-'));
    try {
      if (proxy) {
        inst.bridge = await startBridge(proxy);
        args.push('-http-proxy', `http://127.0.0.1:${inst.bridge.port}`);
        this._log(inst, `Ponte de proxy ativa em 127.0.0.1:${inst.bridge.port} -> ${proxy.type}://${proxy.host}:${proxy.port}`);
      }
      if (opts.extraArgs) args.push(...opts.extraArgs);
      this._log(inst, `$ emulator ${args.join(' ')}`);
      const child = spawn(this.sdk.emulatorPath, args, {
        cwd: path.dirname(this.sdk.emulatorPath),
        env: this._env(),
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      inst.child = child;
      if (inst.status === 'stopped') { // stop() was called while the bridge was starting
        killTree(child);
        return { port: profile.port, bridgePort: null };
      }
      const onOut = (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) this._log(inst, line.trim());
      };
      child.stdout.on('data', onOut);
      child.stderr.on('data', onOut);
      child.on('error', (err) => {
        this._log(inst, `Erro ao iniciar emulador: ${err.message}`);
        this._cleanup(inst, `spawn: ${err.message}`);
      });
      child.on('exit', (code, signal) => {
        this._log(inst, `Emulador encerrado (code=${code} signal=${signal || ''})`);
        const detail = inst.status === 'stopping' || code === 0 ? '' : this._diagnose(inst);
        this._cleanup(inst, detail);
      });
      this._waitBoot(inst, profile).catch(() => { /* handled inside */ });
      return { port: profile.port, bridgePort: inst.bridge ? inst.bridge.port : null };
    } catch (err) {
      await this._cleanup(inst, err.message);
      throw err;
    }
  }

  _diagnose(inst) {
    const text = inst.log.join('\n');
    if (/HAXM|WHPX|hypervisor|KVM|accel|Hyper-V|x86 emulation currently requires hardware acceleration/i.test(text)) return 'NO_ACCEL';
    if (/Cannot find AVD|Unknown AVD name/i.test(text)) return 'AVD_MISSING';
    if (/system image|system\.img|No system image/i.test(text)) return 'IMAGE_MISSING';
    if (/already running|Running multiple emulators with the same AVD/i.test(text)) return 'AVD_BUSY';
    if (/port/i.test(text) && /in use|busy/i.test(text)) return 'PORT_BUSY';
    return 'EXITED';
  }

  async _waitBoot(inst, profile) {
    const serial = `emulator-${profile.port}`;
    const deadline = Date.now() + 240000;
    while (inst.status === 'starting' && Date.now() < deadline) {
      await sleep(3000);
      try {
        const out = await this.adb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed']);
        if (out.trim() === '1') {
          this._log(inst, 'Android inicializado.');
          await this._postBoot(inst, profile, serial);
          if (inst.status === 'starting') this._set(inst, 'running');
          return;
        }
      } catch (_) { /* not yet */ }
    }
    if (inst.status === 'starting') {
      this._log(inst, 'Tempo esgotado esperando o boot; o emulador continua aberto.');
      this._set(inst, 'running', 'BOOT_TIMEOUT');
    }
  }

  async _postBoot(inst, profile, serial) {
    const cmds = [];
    if (profile.deviceName) cmds.push(['shell', 'settings', 'put', 'global', 'device_name', profile.deviceName]);
    for (const c of cmds) {
      try { await this.adb(['-s', serial, ...c]); } catch (err) { this._log(inst, `adb ${c.join(' ')}: ${err.message}`); }
    }
  }

  async stop(profileId) {
    const inst = this.instances.get(profileId);
    if (!inst || inst.status === 'stopped') return;
    this._set(inst, 'stopping');
    const serial = `emulator-${inst.port}`;
    try { await this.adb(['-s', serial, 'emu', 'kill'], { timeout: 8000 }); } catch (_) { /* fall through */ }
    const exited = await this._waitExit(inst, 12000);
    if (!exited && inst.child) {
      this._log(inst, 'Forçando encerramento...');
      killTree(inst.child);
      await this._waitExit(inst, 8000);
    }
    if (inst.status !== 'stopped') await this._cleanup(inst, '');
  }

  _waitExit(inst, ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (inst.status === 'stopped' || !inst.child || inst.child.exitCode !== null) return resolve(true);
        if (Date.now() - t0 > ms) return resolve(false);
        setTimeout(tick, 300);
      };
      tick();
    });
  }

  async _cleanup(inst, detail) {
    if (inst.bridge) { try { await inst.bridge.close(); } catch (_) { /* ignore */ } inst.bridge = null; }
    if (inst.status !== 'stopped') this._set(inst, 'stopped', detail || '');
  }

  async stopAll() {
    await Promise.all([...this.instances.keys()].map((id) => this.stop(id).catch(() => { /* ignore */ })));
  }

  getLog(profileId) {
    const i = this.instances.get(profileId);
    return i ? i.log.slice() : [];
  }

  // Is the AVD referenced by a running emulator (e.g. started outside the app)?
  async listAdbDevices() {
    try {
      const out = await this.adb(['devices']);
      return out.split(/\r?\n/).slice(1).map((l) => l.trim().split(/\s+/)).filter((p) => p[0]).map(([serial, state]) => ({ serial, state }));
    } catch (_) { return []; }
  }

  avdLockExists(avdId, home) {
    const dir = path.join(avdHome(home), `${avdId}.avd`);
    return fs.existsSync(path.join(dir, 'hardware-qemu.ini.lock'));
  }
}

function killTree(child) {
  try {
    if (IS_WIN) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGKILL');
  } catch (_) { /* ignore */ }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = { EmulatorManager };
