'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Small JSON store with atomic writes. All app data lives in a single file
// inside Electron's userData folder.
class Store {
  constructor(file) {
    this.file = file;
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
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
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
