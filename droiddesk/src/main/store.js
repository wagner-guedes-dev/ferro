'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Small JSON store with atomic writes. All app data lives in a single file
// inside Electron's userData folder.
class Store {
  constructor(file, codec = null) {
    this.file = file;
    this.codec = codec; // { encrypt(text) -> string, decrypt(text) -> string } for proxy passwords
    this.data = {
      version: 1,
      settings: { language: 'pt-BR', sdkPath: '', avdHome: '', nextSerial: 1 },
      groups: [],
      proxies: [],
      profiles: [],
      browsers: [],
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data = {
          ...this.data,
          ...raw,
          settings: { ...this.data.settings, ...(raw.settings || {}) },
          groups: Array.isArray(raw.groups) ? raw.groups : [],
          proxies: Array.isArray(raw.proxies) ? raw.proxies : [],
          profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
          browsers: Array.isArray(raw.browsers) ? raw.browsers : [],
        };
        this._mapSecrets((v) => this._decrypt(v));
      }
    } catch (err) {
      // Corrupted file: keep a backup and start fresh rather than crash.
      try { fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`); } catch (_) { /* ignore */ }
    }
  }

  save() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    const snapshot = JSON.parse(JSON.stringify(this.data));
    if (this.codec) {
      const enc = (v) => (typeof v === 'string' && v && !v.startsWith('enc:') ? this.codec.encrypt(v) : v);
      for (const px of snapshot.proxies) px.password = enc(px.password);
      for (const list of [snapshot.profiles, snapshot.browsers]) for (const p of list) if (p.proxy) p.proxy.password = enc(p.proxy.password);
    }
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  _decrypt(v) {
    if (typeof v !== 'string' || !v.startsWith('enc:')) return v;
    if (!this.codec) return v; // encrypted on another machine/user: keep as is
    try { return this.codec.decrypt(v); } catch (_) { return v; }
  }

  _mapSecrets(fn) {
    for (const px of this.data.proxies) px.password = fn(px.password);
    for (const list of [this.data.profiles, this.data.browsers]) for (const p of list) if (p && p.proxy) p.proxy.password = fn(p.proxy.password);
  }

  static newId() {
    return crypto.randomBytes(8).toString('hex');
  }

  get settings() { return this.data.settings; }
  get profiles() { return this.data.profiles; }
  get proxies() { return this.data.proxies; }
  get groups() { return this.data.groups; }
  get browsers() { return this.data.browsers; }

  setSettings(patch) {
    Object.assign(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  nextSerial() {
    const n = this.data.settings.nextSerial || 1;
    this.data.settings.nextSerial = n + 1;
    return n;
  }

  // Emulator console ports must be even numbers between 5554 and 5682.
  allocatePort() {
    const used = new Set(this.data.profiles.map((p) => p.port));
    for (let port = 5554; port <= 5682; port += 2) {
      if (!used.has(port)) return port;
    }
    throw new Error('PORTS_EXHAUSTED');
  }
}

module.exports = { Store };
