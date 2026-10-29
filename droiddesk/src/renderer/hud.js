'use strict';
(function () {
  const Q = { excellent: 4, good: 3, fair: 2, poor: 1, down: 0 };
  const hud = document.getElementById('hud');
  window.hud.onUpdate((d) => {
    const q = d.quality || 'unknown';
    hud.className = `hud ${q in Q ? `q${Q[q]}` : 'qx'}`;
    hud.title = d.latency != null && q !== 'down' ? `${d.name || ''} · ${d.latency} ms · ${d.stability ?? '-'}%` : `${d.name || ''} · ${q}`;
  });
})();
