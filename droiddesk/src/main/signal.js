'use strict';
const EventEmitter = require('events');
const { pingProxy } = require('./proxy');

const INTERVAL = 15000;
const MAX_SAMPLES = 8;

// Quality from recent samples: 'excellent' | 'good' | 'fair' | 'poor' | 'down'
function quality(samples) {
  if (!samples.length) return 'unknown';
  const last = samples.slice(-2);
  if (last.length === 2 && last.every((x) => !x.ok)) return 'down';
  if (!samples[samples.length - 1].ok) return 'poor';
  const ok = samples.filter((x) => x.ok);
  const fails = samples.slice(-4).filter((x) => !x.ok).length;
  const avg = ok.reduce((a, x) => a + x.latency, 0) / ok.length;
  if (fails > 0 || avg > 1200) return 'poor';
  if (avg > 500) return 'fair';
  if (avg > 200) return 'good';
  return 'excellent';
}

function summarize(samples) {
  const ok = samples.filter((x) => x.ok);
  return {
    quality: quality(samples),
    latency: ok.length ? Math.round(ok[ok.length - 1].latency) : null,
    avg: ok.length ? Math.round(ok.reduce((a, x) => a + x.latency, 0) / ok.length) : null,
    stability: samples.length ? Math.round((ok.length / samples.length) * 100) : null,
    samples: samples.length,
    updatedAt: samples.length ? samples[samples.length - 1].at : null,
  };
}

/**
 * Periodically pings the upstream proxy of every running profile and emits
 * 'signal' ({ key, kind, profileId, ...summary }).
 */
class SignalMonitor extends EventEmitter {
  constructor() { super(); this.items = new Map(); }

  track(key, { kind, profileId, proxy }) {
    this.untrack(key);
    const item = { key, kind, profileId, proxy, samples: [], timer: null, busy: false };
    this.items.set(key, item);
    const tick = async () => {
      if (item.busy || !this.items.has(key)) return;
      item.busy = true;
      const r = await pingProxy(proxy);
      item.busy = false;
      if (!this.items.has(key)) return;
      item.samples.push(r);
      if (item.samples.length > MAX_SAMPLES) item.samples.shift();
      this.emit('signal', this.stateOf(item));
    };
    item.timer = setInterval(tick, INTERVAL);
    tick();
  }

  untrack(key) {
    const item = this.items.get(key);
    if (!item) return;
    clearInterval(item.timer);
    this.items.delete(key);
    this.emit('signal', { key, kind: item.kind, profileId: item.profileId, quality: 'off', latency: null, avg: null, stability: null, samples: 0 });
  }

  stateOf(item) { return { key: item.key, kind: item.kind, profileId: item.profileId, ...summarize(item.samples) }; }
  all() { const out = {}; for (const item of this.items.values()) out[item.key] = this.stateOf(item); return out; }
  stopAll() { for (const key of [...this.items.keys()]) this.untrack(key); }
}

module.exports = { SignalMonitor, quality, summarize };
