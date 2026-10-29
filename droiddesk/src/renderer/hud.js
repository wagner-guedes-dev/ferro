'use strict';
(function () {
  const Q = { excellent: 4, good: 3, fair: 2, poor: 1, down: 0 };
  const LABEL = {
    'pt-BR': { excellent: 'Excelente', good: 'Bom', fair: 'Regular', poor: 'Instável', down: 'Sem resposta', unknown: 'Medindo…', stab: 'estab.', avg: 'média' },
    en: { excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Unstable', down: 'No response', unknown: 'Measuring…', stab: 'stab.', avg: 'avg' },
  };
  let lang = 'pt-BR';
  const hud = document.getElementById('hud');
  window.hud.onUpdate((d) => {
    if (d.lang) lang = LABEL[d.lang] ? d.lang : 'en';
    const L = LABEL[lang];
    if (d.name) document.getElementById('name').textContent = d.name;
    const q = d.quality || 'unknown';
    hud.className = `hud ${q in Q ? `q${Q[q]}` : 'qx'}`;
    document.getElementById('val').textContent = d.latency != null && q !== 'down' ? `${d.latency} ms · ${L[q] || q}` : (L[q] || q);
    document.getElementById('sub').textContent = d.samples ? `${L.avg} ${d.avg ?? '-'} ms · ${L.stab} ${d.stability ?? '-'}%` : (d.proxy || '');
  });
  document.getElementById('close').onclick = () => window.hud.close();
})();
