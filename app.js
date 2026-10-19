const $ = (s) => document.querySelector(s);
const NOME = "Wagner";
const hojeDow = new Date().getDay();
let dia = hojeDow;
let aba = "hoje";
let sub = "refeicoes";
let chat = [];
let carregandoIA = false;

// ---------- datas e armazenamento ----------
// Os dados ficam no navegador (localStorage) e, quando o servidor está ligado,
// também em data/dados.json (sincronizado automaticamente).
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hojeKey = () => fmt(new Date());
function chaveDoDia(dow) {
  const d = new Date();
  d.setDate(d.getDate() + (dow - d.getDay()));
  return fmt(d);
}
const dowDeKey = (key) => new Date(key + "T12:00:00").getDay();
const br = (n, c = 1) => Number(n).toFixed(c).replace(".", ",");
function ler(k, padrao) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
}
let timerSync;
function gravar(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem("_ts", String(Date.now())); } catch {}
  clearTimeout(timerSync);
  timerSync = setTimeout(enviarServidor, 800);
}
function snapshot() {
  const dados = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== "_ts") dados[k] = localStorage.getItem(k); }
  return { ts: Number(localStorage.getItem("_ts") || 0), dados };
}
async function enviarServidor() {
  try { await fetch("/api/dados", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot()) }); } catch {}
}
async function receberServidor() {
  try {
    const r = await fetch("/api/dados");
    if (!r.ok) return;
    const s = await r.json();
    const local = Number(localStorage.getItem("_ts") || 0);
    if (s && s.dados && s.ts > local) {
      Object.entries(s.dados).forEach(([k, v]) => localStorage.setItem(k, v));
      localStorage.setItem("_ts", String(s.ts));
      render();
    } else if (local > (s?.ts || 0)) enviarServidor();
  } catch {}
}

const vazio = () => ({ ex: {}, ref: {}, comi: {}, agua: 0 });
const estadoKey = (key) => ler("dia:" + key, vazio());
const estado = (dow) => estadoKey(chaveDoDia(dow));
const salvar = (dow, e) => gravar("dia:" + chaveDoDia(dow), e);

// ---------- cálculos ----------
function resumoDia(key) {
  const e = estadoKey(key);
  const t = TREINOS[SEMANA[dowDeKey(key)].treino];
  const total = t.exercicios.length;
  const feitos = t.exercicios.filter((_, i) => e.ex[i]).length;
  let k = 0, p = 0, comidas = 0;
  REFEICOES.forEach((r) => { if (e.comi[r.id]) { const o = r.opcoes[e.ref[r.id] ?? 0]; k += o.k; p += o.p; comidas++; } });
  return { key, feitos, total, treino: total ? feitos / total : null, agua: e.agua / META.agua, ml: e.agua, kcal: k, prot: p, comidas, caminhou: !!e.ex.walk };
}
function diasDesdeInicio() {
  const chaves = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("dia:")) chaves.push(k.slice(4)); }
  chaves.sort();
  const out = [];
  if (!chaves.length) return out;
  const d = new Date(chaves[0] + "T12:00:00"), fim = new Date();
  for (; d <= fim && out.length < 800; d.setDate(d.getDate() + 1)) out.push(resumoDia(fmt(d)));
  return out;
}
function ultimosDias(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(resumoDia(fmt(d))); }
  return out;
}
function estatisticas() {
  const todos = diasDesdeInicio();
  let atual = 0, melhor = 0, corrida = 0, xp = 0, aguaDias = 0, dietaDias = 0, treinos = 0;
  todos.forEach((d) => {
    xp += d.feitos * 10 + d.comidas * 8 + (d.agua >= 1 ? 30 : 0) + (d.caminhou ? 20 : 0);
    if (d.agua >= 1) aguaDias++;
    if (d.comidas >= REFEICOES.length) dietaDias++;
    if (d.treino === null) return;
    if (d.treino >= 0.8) { corrida++; treinos++; melhor = Math.max(melhor, corrida); }
    else if (d.key !== hojeKey()) corrida = 0;
  });
  atual = corrida;
  const pesos = Object.keys(ler("pesos", {})).length;
  return { xp, atual, melhor, aguaDias, dietaDias, treinos, pesos };
}
const NIVEIS = ["Iniciante", "Constante", "Focado", "Forte", "Intenso", "Monstro", "Lenda"];
function nivel(xp) {
  const n = Math.min(NIVEIS.length - 1, Math.floor(xp / 400));
  const base = n * 400, prox = (n + 1) * 400;
  return { n: n + 1, nome: NIVEIS[n], pct: n === NIVEIS.length - 1 ? 100 : ((xp - base) / (prox - base)) * 100, falta: prox - xp, max: n === NIVEIS.length - 1 };
}
const FRASES = [
  "Constância vence motivação. Faça o treino de hoje, mesmo que seja o mínimo.",
  "Músculo cresce no prato e na cama: coma bem e durma 7 a 9 horas.",
  "Cada série concluída é um voto na pessoa que você quer ser.",
  "Carga que sobe, corpo que responde. Anote o que você levantou.",
  "Você não precisa estar motivado. Só precisa começar.",
  "Água na garrafa, proteína no prato, treino feito. Dia ganho.",
  "Progresso é lento por fora e rápido por dentro. Confie no processo.",
];

// ---------- feedback ----------
let timerToast;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(timerToast); timerToast = setTimeout(() => t.classList.remove("on"), 2600);
}
function confete() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = $("#confete"), x = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const cores = ["#2a4bff", "#c6f432", "#19b6f2", "#ff5c4d", "#ffffff"];
  const ps = Array.from({ length: 110 }, () => ({
    x: c.width / 2, y: c.height * 0.55, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 4,
    r: Math.random() * 6 + 3, cor: cores[(Math.random() * cores.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
  }));
  let f = 0;
  (function anim() {
    x.clearRect(0, 0, c.width, c.height);
    ps.forEach((p) => {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.fillStyle = p.cor; x.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); x.restore();
    });
    if (++f < 110) requestAnimationFrame(anim); else x.clearRect(0, 0, c.width, c.height);
  })();
}

// ---------- componentes ----------
function aneis(vals) {
  // vals: [{pct, cor}] do anel externo para o interno
  const raios = [62, 48, 34];
  return `<svg viewBox="0 0 150 150" aria-hidden="true">${vals.map((v, i) => {
    const r = raios[i], c = 2 * Math.PI * r;
    return `<circle class="trilho" cx="75" cy="75" r="${r}" stroke-width="10"/>
      <circle cx="75" cy="75" r="${r}" stroke-width="10" stroke="${v.cor}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, v.pct))}"/>`;
  }).join("")}</svg>`;
}
function chipsDias() {
  return `<div class="dias">${[1, 2, 3, 4, 5, 6, 0].map((i) => {
    const r = resumoDia(chaveDoDia(i));
    const ok = r.treino !== null && r.treino >= 0.8;
    return `<button data-dia="${i}" class="${i === dia ? "ativa" : ""} ${i === hojeDow ? "hoje" : ""} ${ok ? "ok" : ""}" aria-label="${SEMANA[i].nome}">${SEMANA[i].abrev}<small>${SEMANA[i].nome.slice(0, 3)}</small></button>`;
  }).join("")}</div>`;
}

// ---------- telas ----------
function viewHoje() {
  const key = hojeKey();
  const r = resumoDia(key), e = estadoKey(key);
  const t = TREINOS[SEMANA[hojeDow].treino];
  const descanso = r.treino === null;
  const pTreino = descanso ? 1 : r.treino, pDieta = r.comidas / REFEICOES.length, pAgua = Math.min(1, r.agua);
  const total = Math.round(((pTreino + pDieta + pAgua) / 3) * 100);
  const st = estatisticas();
  const agora = new Date(), hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const prox = REFEICOES.find((x) => !e.comi[x.id] && x.hora >= hhmm) || REFEICOES.find((x) => !e.comi[x.id]);
  const frase = FRASES[Math.floor(new Date().getTime() / 864e5) % FRASES.length];
  const nv = nivel(st.xp);
  let blocoProx = `<div class="card vazio"><div class="grande">🎉</div>Todas as refeições de hoje foram feitas. Bom trabalho!</div>`;
  if (prox) {
    const o = prox.opcoes[e.ref[prox.id] ?? 0];
    blocoProx = `<div class="card">
      <div class="linha"><div class="bolha">${prox.emoji}</div>
        <div><div class="mut">Próxima refeição · ${prox.hora}</div><div class="grande">${prox.nome}</div></div></div>
      <p class="prato" style="margin-top:12px">${o.t}</p><p class="desc">${o.d}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
        <button class="btn fantasma" data-aba="dieta">Trocar opção</button>
        <button class="btn limao" data-comi-rapido="${prox.id}">Já comi</button></div></div>`;
  }
  const blocoTreino = descanso
    ? `<div class="card"><div class="linha"><div class="bolha">😴</div><div><div class="mut">Treino de hoje</div><div class="grande">Dia de descanso</div></div></div>
        <p class="desc" style="margin-top:10px">${t.dica}</p></div>`
    : `<div class="card"><div class="linha"><div class="bolha">${t.emoji}</div>
        <div><div class="mut">Treino de hoje · ${ROTINA.treino}</div><div class="grande">${t.nome}</div></div></div>
        <div class="barra"><div style="width:${pTreino * 100}%;background:var(--blue)"></div></div>
        <p class="mut" style="margin:8px 0 12px">${r.feitos} de ${r.total} exercícios · ${t.exercicios.length ? "cerca de " + Math.round(t.exercicios.length * 7) + " min" : ""}</p>
        <button class="btn azul" data-ir-treino>${r.feitos === 0 ? "Começar treino" : r.feitos === r.total ? "Ver treino concluído" : "Continuar treino"}</button></div>`;
  const eventos = [
    { h: ROTINA.acordar, t: "Acordar", e: "⏰", sub: "Beba 500 ml de água" },
    ...(descanso ? [] : [{ h: ROTINA.treino, t: "Treino", e: t.emoji, sub: t.nome, ir: true }]),
    ...REFEICOES.map((x) => ({ h: x.hora, t: x.nome, e: x.emoji, sub: x.opcoes[e.ref[x.id] ?? 0].t, feito: !!e.comi[x.id] })),
    { h: ROTINA.dormir, t: "Dormir", e: "🌙", sub: "8 horas de sono: é quando o músculo cresce" },
  ].sort((a, b) => a.h.localeCompare(b.h));
  let agoraIdx = -1;
  eventos.forEach((ev, i) => { if (ev.h <= hhmm) agoraIdx = i; });
  const blocoDia = `<div class="card"><h3>Seu dia</h3><ol class="tempo">${eventos.map((ev, i) => `
    <li class="${ev.feito ? "feito" : ""} ${i === agoraIdx ? "agora" : ""}"><time>${ev.h}</time>
      <span class="ico">${ev.e}</span><div><b>${ev.t}</b><small>${ev.sub}</small></div>${ev.feito ? `<span class="ok-tag">✓</span>` : ""}</li>`).join("")}</ol></div>`;
  return `
    <section class="hero">
      <div class="aneis">${aneis([{ pct: pTreino, cor: "#fff" }, { pct: pDieta, cor: "#c6f432" }, { pct: pAgua, cor: "#19b6f2" }])}
        <div class="centro"><b>${total}%</b><span>do dia</span></div></div>
      <div class="legenda">
        <div><i style="background:#fff"></i>Treino<b>${descanso ? "descanso" : Math.round(pTreino * 100) + "%"}</b></div>
        <div><i style="background:#c6f432"></i>Dieta<b>${r.comidas}/${REFEICOES.length}</b></div>
        <div><i style="background:#19b6f2"></i>Água<b>${br(r.ml / 1000, 1)} L</b></div>
      </div>
      <p class="frase">${frase}</p>
    </section>
    ${blocoTreino}
    ${blocoProx}
    ${blocoDia}
    <div class="card">
      <div class="linha"><div class="bolha">💧</div><div style="flex:1"><div class="mut">Água de hoje</div>
        <div class="grande">${br(r.ml / 1000, 2)} de ${br(META.agua / 1000)} L</div></div></div>
      <div class="barra"><div style="width:${pAgua * 100}%"></div></div>
      <div class="gotas"><button data-ml="250">+250 ml</button><button data-ml="500">+500 ml</button><button class="menos" data-ml="-250">−250</button></div>
    </div>
    <div class="card nivel">
      <div class="linha" style="justify-content:space-between"><div class="grande">Nível ${nv.n} · ${nv.nome}</div><div class="mut">${st.xp} XP</div></div>
      <div class="barra"><div style="width:${nv.pct}%"></div></div>
      <p class="mut" style="margin-top:8px">${nv.max ? "Nível máximo. Respeito." : `Faltam ${nv.falta} XP para o próximo nível. Treino, refeições e água dão XP.`}</p>
    </div>`;
}

function viewTreino() {
  const t = TREINOS[SEMANA[dia].treino];
  const key = chaveDoDia(dia), e = estado(dia);
  const cargas = ler("cargas", {});
  const feitos = t.exercicios.filter((_, i) => e.ex[i]).length;
  const lista = t.exercicios.map((x, i) => {
    const yt = "https://www.youtube.com/results?search_query=" + encodeURIComponent("como fazer " + x.n + " execução correta");
    const hist = cargas[x.n] || {};
    const anteriores = Object.keys(hist).filter((k) => k < key).sort();
    const ultima = anteriores.length ? hist[anteriores[anteriores.length - 1]] : null;
    return `
    <div class="ex ${e.ex[i] ? "feito" : ""}">
      <a class="thumb" href="${yt}" target="_blank" rel="noopener" aria-label="Ver vídeo de ${x.n}">
        <span class="anim"><img src="img/${x.img}_0.jpg" alt="" loading="lazy"><img src="img/${x.img}_1.jpg" alt="" loading="lazy"></span></a>
      <div class="ex-txt">
        <div class="nome">${x.n}</div>
        <div class="info">${x.s}${x.d ? " · descanso " + x.d : ""}</div>
        <div class="acoes">
          <label class="carga"><input type="number" inputmode="decimal" step="0.5" min="0" placeholder="${ultima ? ultima : "kg"}" value="${hist[key] ?? ""}" data-carga="${i}" aria-label="Carga usada em ${x.n}"> kg${ultima ? ` · última ${ultima}` : ""}</label>
          <a class="video" href="${yt}" target="_blank" rel="noopener">▶ Vídeo</a>
        </div>
      </div>
      <input class="check" type="checkbox" data-ex="${i}" ${e.ex[i] ? "checked" : ""} aria-label="Concluir ${x.n}">
    </div>`;
  }).join("");
  const caminhada = t.semCaminhada ? "" : `
    <label class="card item ${e.ex.walk ? "feito" : ""}">
      <input class="check" type="checkbox" data-ex="walk" ${e.ex.walk ? "checked" : ""}>
      <div><div class="nome" style="font-weight:600">🚶 ${CAMINHADA.texto}</div><div class="mut">${CAMINHADA.info}</div></div>
    </label>`;
  return `
    ${chipsDias()}
    <h2 class="titulo">${t.emoji} ${t.nome}</h2>
    <p class="mut" style="margin:6px 0 12px">${t.dica}</p>
    ${t.exercicios.length ? `<div class="prog"><span class="mut">Toque na foto para ver o vídeo</span><b>${feitos}/${t.exercicios.length}</b></div>
    <div class="card lista-ex">${lista}</div>` : `<div class="card vazio"><div class="grande">😴</div>Hoje é dia de recuperar. Sem treino, mas mantenha dieta e água.</div>`}
    ${caminhada}`;
}

function viewDieta() {
  const seg = `<div class="seg"><button data-sub="refeicoes" class="${sub === "refeicoes" ? "ativa" : ""}">🍽️ Refeições</button><button data-sub="compras" class="${sub === "compras" ? "ativa" : ""}">🛒 Compras</button></div>`;
  if (sub === "compras") {
    const marc = ler("compras", {});
    const tot = COMPRAS.reduce((s, c) => s + c.itens.length, 0), ok = Object.values(marc).filter(Boolean).length;
    return `${seg}
      <h2 class="titulo">Compras da semana</h2>
      <p class="mut" style="margin:6px 0 12px">Compre no fim de semana e prepare as marmitas no domingo.</p>
      <div class="prog"><span class="mut">No carrinho</span><b>${ok}/${tot}</b></div>
      ${COMPRAS.map((c, ci) => `
        <div class="card cat"><h3>${c.cat}</h3>
          ${c.itens.map((it, ii) => `
            <label class="item ${marc[ci + "-" + ii] ? "feito" : ""}">
              <input class="check" type="checkbox" data-compra="${ci}-${ii}" ${marc[ci + "-" + ii] ? "checked" : ""}>
              <span class="nome">${it}</span></label>`).join("")}</div>`).join("")}
      <button class="btn fantasma" data-limpar>Começar nova semana (desmarcar tudo)</button>`;
  }
  const e = estado(dia);
  let k = 0, p = 0;
  const cards = REFEICOES.map((r) => {
    const sel = e.ref[r.id] ?? 0, o = r.opcoes[sel];
    if (e.comi[r.id]) { k += o.k; p += o.p; }
    return `
      <div class="card refeicao ${e.comi[r.id] ? "comida" : ""}">
        <div class="ref-topo"><h3>${r.emoji} ${r.nome}</h3><span>${r.hora}</span></div>
        <div class="opcoes">${r.opcoes.map((op, i) => `<button data-ref="${r.id}" data-op="${i}" class="${i === sel ? "sel" : ""}">Opção ${i + 1}</button>`).join("")}</div>
        <p class="prato">${o.t}</p><p class="desc">${o.d}</p>
        <div class="macros">≈ ${o.k} kcal · ${o.p} g de proteína</div>
        <label class="item comi"><input class="check" type="checkbox" data-comi="${r.id}" ${e.comi[r.id] ? "checked" : ""}><span>Já comi</span></label>
      </div>`;
  }).join("");
  return `${seg}${chipsDias()}
    <h2 class="titulo">Dieta do dia</h2>
    <p class="mut" style="margin:6px 0 12px">Escolha a opção que preferir em cada refeição. Meta: ${META.kcal} kcal e ${META.proteina} g de proteína.</p>
    <div class="card resumo">
      <div><b>${k}</b><span>kcal comidas</span></div><div><b>${p} g</b><span>proteína</span></div>
      <div><b>${Math.max(0, META.kcal - k)}</b><span>kcal restantes</span></div></div>${cards}`;
}

// ----- Evolução -----
const MEDIDAS = [["braco", "Braço (cm)"], ["peito", "Peito (cm)"], ["cintura", "Cintura (cm)"], ["coxa", "Coxa (cm)"]];
function linhaPeso(reg) {
  if (reg.length < 2) return `<div class="vazio" style="padding:14px"><div class="grande">⚖️</div>Registre seu peso em 2 dias diferentes para ver o gráfico.</div>`;
  const W = 320, H = 130, pad = 16;
  const vals = reg.map((r) => r.peso), min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5;
  const pts = reg.map((r, i) => [pad + (i / (reg.length - 1)) * (W - 2 * pad), H - 22 - ((r.peso - min) / (max - min)) * (H - 40)]);
  const dm = (k) => k.slice(5).split("-").reverse().join("/");
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Evolução do peso">
    <polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="var(--blue)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="var(--blue)"/><text x="${p[0]}" y="${p[1] - 10}" class="gt" text-anchor="middle">${br(reg[i].peso)}</text>`).join("")}
    <text x="${pad}" y="${H - 2}" class="gt">${dm(reg[0].key)}</text><text x="${W - pad}" y="${H - 2}" class="gt" text-anchor="end">${dm(reg[reg.length - 1].key)}</text></svg>`;
}
function barras(dias, campo, rotulo) {
  const W = 320, H = 70, bw = W / dias.length;
  return `<div class="gtitulo">${rotulo}</div><svg viewBox="0 0 ${W} ${H + 14}" class="grafico" role="img" aria-label="${rotulo}">
    ${dias.map((d, i) => {
      const v = d[campo], h = v === null ? 0 : Math.max(3, Math.min(1, v) * H);
      return `<rect x="${i * bw + 2}" y="${H - h}" width="${bw - 4}" height="${h}" rx="4" fill="${v !== null && v >= 1 ? "var(--ok)" : "var(--blue)"}" opacity="${v === null ? 0 : v >= 1 ? 1 : 0.55}"/>
        <text x="${i * bw + bw / 2}" y="${H + 12}" class="gt" text-anchor="middle">${SEMANA[dowDeKey(d.key)].nome[0]}</text>`;
    }).join("")}</svg>`;
}
function viewEvolucao() {
  const hist = ler("pesos", {});
  const reg = Object.keys(hist).sort().map((key) => ({ key, ...hist[key] }));
  const d14 = ultimosDias(14), d7 = d14.slice(7);
  const treinaveis = d7.filter((d) => d.treino !== null), feitos = treinaveis.filter((d) => d.treino >= 0.8).length;
  const mediaAgua = d7.reduce((s, d) => s + Math.min(1, d.agua), 0) / 7;
  const comDieta = d7.filter((d) => d.comidas > 0);
  const mediaKcal = comDieta.length ? Math.round(comDieta.reduce((s, d) => s + d.kcal, 0) / comDieta.length) : 0;
  const st = estatisticas(), nv = nivel(st.xp);
  const primeiro = reg.length ? reg[0].peso : PERFIL.peso, atual = reg.length ? reg[reg.length - 1].peso : PERFIL.peso;
  const dif = atual - primeiro, imc = atual / (PERFIL.altura * PERFIL.altura);
  const ult = reg.length ? reg[reg.length - 1] : {}, prim = reg.length ? reg[0] : {};
  const tabMed = MEDIDAS.filter(([k]) => ult[k]).map(([k, n]) => {
    const dd = prim[k] ? ult[k] - prim[k] : 0;
    return `<tr><td>${n.replace(" (cm)", "")}</td><td>${br(ult[k])} cm</td><td class="${dd > 0 ? "pos" : ""}">${dd > 0 ? "+" : ""}${br(dd)}</td></tr>`;
  }).join("");
  const badges = [
    ["🏁", "Primeiro treino", st.treinos >= 1], ["🔥", "5 treinos seguidos", st.melhor >= 5], ["💎", "20 treinos seguidos", st.melhor >= 20],
    ["💧", "Meta de água", st.aguaDias >= 1], ["🌊", "7 dias de água", st.aguaDias >= 7], ["🍽️", "Dieta completa", st.dietaDias >= 1],
    ["⚖️", "Na balança", st.pesos >= 2], ["📏", "Medidas em dia", reg.some((r) => r.braco || r.cintura)], ["👑", "Nível 4", nv.n >= 4],
  ];
  return `
    <h2 class="titulo">Minha evolução</h2>
    <p class="mut" style="margin:6px 0 12px">Pese-se em jejum, sempre no mesmo dia da semana. Meta realista: ganhar de 0,25 a 0,5 kg por semana.</p>
    <div class="kpis">
      <div class="card kpi"><b>${br(atual)} kg</b><span>peso atual</span></div>
      <div class="card kpi"><b>${dif > 0 ? "+" : ""}${br(dif)} kg</b><span>desde o início · IMC ${br(imc)}</span></div>
    </div>
    <div class="card"><h3>Registrar hoje</h3>
      <form id="form-peso" class="form">
        <label>Peso (kg)<input name="peso" type="number" inputmode="decimal" step="0.1" min="30" max="250" required value="${hist[hojeKey()]?.peso ?? ""}"></label>
        ${MEDIDAS.map(([k, n]) => `<label>${n}<input name="${k}" type="number" inputmode="decimal" step="0.1" min="5" max="250" value="${hist[hojeKey()]?.[k] ?? ""}"></label>`).join("")}
        <button type="submit" class="btn azul">Salvar registro</button>
      </form></div>
    <div class="card"><h3>Peso ao longo do tempo</h3>${linhaPeso(reg)}${tabMed ? `<table class="tab"><tr><th>Medida</th><th>Atual</th><th>Variação</th></tr>${tabMed}</table>` : ""}</div>
    <div class="sec"><h2 class="titulo">Dashboard</h2></div>
    <div class="kpis">
      <div class="card kpi"><b>${feitos}/${treinaveis.length}</b><span>treinos nos últimos 7 dias</span></div>
      <div class="card kpi"><b>🔥 ${st.atual}</b><span>treinos seguidos (recorde ${st.melhor})</span></div>
      <div class="card kpi"><b>${Math.round(mediaAgua * 100)}%</b><span>da meta de água</span></div>
      <div class="card kpi"><b>${mediaKcal || "–"}</b><span>kcal por dia</span></div>
    </div>
    <div class="card">${barras(d14, "treino", "Treino concluído, últimos 14 dias")}${barras(d14, "agua", "Água, últimos 14 dias")}
      <p class="mut" style="margin-top:8px;font-size:.82rem">Barra verde = meta batida.</p></div>
    <div class="card nivel"><div class="linha" style="justify-content:space-between"><div class="grande">Nível ${nv.n} · ${nv.nome}</div><div class="mut">${st.xp} XP</div></div>
      <div class="barra"><div style="width:${nv.pct}%"></div></div></div>
    <div class="sec"><h2 class="titulo">Conquistas</h2></div>
    <div class="badges">${badges.map(([i, n, on]) => `<div class="badge ${on ? "on" : ""}"><i>${i}</i>${n}</div>`).join("")}</div>
    <button class="btn fantasma" style="margin-top:16px" data-exportar>Baixar backup dos meus dados</button>`;
}

// ----- Coach IA -----
const md = (txt) => txt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
function viewCoach() {
  const sug = ["Dicas de execução do treino de hoje", "Analise meu progresso", "Troquei o almoço, o que ajusto?", "Estou sem fome, o que faço?"];
  return `
    <h2 class="titulo">Coach IA</h2>
    <p class="mut" style="margin:6px 0 12px">Pergunte sobre treino, dieta ou evolução. Ele conhece seu plano e seus registros.</p>
    <div class="chat" id="chat">
      ${chat.length === 0 ? `<div class="msg ia">Oi, ${NOME}! Posso explicar exercícios, trocar alimentos, ajustar a dieta e analisar sua evolução. O que você quer saber?</div>` : ""}
      ${chat.map((m) => `<div class="msg ${m.role === "user" ? "eu" : "ia"}">${md(m.content)}</div>`).join("")}
      ${carregandoIA ? `<div class="msg ia">Pensando…</div>` : ""}
    </div>
    <div class="sugs">${sug.map((s) => `<button data-sug="${s}">${s}</button>`).join("")}</div>
    <form id="form-chat" class="chat-form"><input name="q" placeholder="Pergunte ao coach" autocomplete="off" required aria-label="Pergunta"><button>Enviar</button></form>`;
}
function contextoIA() {
  const hist = ler("pesos", {});
  const pesos = Object.keys(hist).sort().slice(-8).map((k) => `${k}: ${hist[k].peso}kg`).join(", ") || "sem registros";
  const t = TREINOS[SEMANA[hojeDow].treino], r = resumoDia(hojeKey());
  const sem = ultimosDias(7).map((d) => `${d.key}: treino ${d.treino === null ? "descanso" : Math.round(d.treino * 100) + "%"}, água ${Math.round(d.agua * 100)}%, ${d.kcal} kcal`).join("\n");
  return `Treino de hoje (${SEMANA[hojeDow].nome}): ${t.nome} - ${t.exercicios.map((x) => `${x.n} ${x.s}`).join("; ") || "descanso"}.
Hoje até agora: ${Math.round((r.treino ?? 0) * 100)}% do treino, ${r.ml} ml de água, ${r.kcal} kcal e ${r.prot} g de proteína registrados.
Metas: ${META.kcal} kcal, ${META.proteina} g proteína, ${META.agua} ml água.
Pesos recentes: ${pesos}.
Últimos 7 dias:\n${sem}`;
}
async function enviarIA(texto) {
  if (!texto.trim() || carregandoIA) return;
  chat.push({ role: "user", content: texto });
  carregandoIA = true; render(); rolarChat();
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: chat.slice(-12), contexto: contextoIA() }) });
    const j = await res.json();
    chat.push({ role: "assistant", content: res.ok ? j.texto : "⚠️ " + (j.erro || "Erro ao falar com a IA.") });
  } catch {
    chat.push({ role: "assistant", content: "⚠️ Sem conexão com o servidor. Abra o site com o servidor ligado (python server.py) para usar a IA." });
  }
  carregandoIA = false; render(); rolarChat();
}
const rolarChat = () => { const c = $("#chat"); if (c) c.scrollTop = c.scrollHeight; };

// ---------- render e eventos ----------
function render() {
  const h = new Date().getHours();
  $("#saudacao").textContent = `${h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"}, ${NOME}`;
  $("#data").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const st = estatisticas();
  $("#chip-streak").innerHTML = `🔥 ${st.atual}<small>${st.atual === 1 ? "treino seguido" : "treinos seguidos"}</small>`;
  document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === aba));
  const views = { hoje: viewHoje, treino: viewTreino, dieta: viewDieta, evolucao: viewEvolucao, coach: viewCoach };
  const antes = scrollY;
  $("#conteudo").innerHTML = views[aba]();
  if (aba === "coach") rolarChat();
  scrollTo(0, antes);
}
function ir(nova) { aba = nova; render(); scrollTo(0, 0); }

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  if (d.dia !== undefined) { dia = +d.dia; render(); }
  else if (d.aba) { if (d.aba === "treino" || d.aba === "dieta") dia = hojeDow; ir(d.aba); }
  else if (d.irTreino !== undefined) { dia = hojeDow; ir("treino"); }
  else if (d.sub) { sub = d.sub; render(); }
  else if (d.ml) {
    const e = estadoKey(hojeKey()); const antes = e.agua;
    e.agua = Math.max(0, e.agua + +d.ml); gravar("dia:" + hojeKey(), e);
    if (antes < META.agua && e.agua >= META.agua) { toast("Meta de água batida! +30 XP 💧"); confete(); }
    render();
  } else if (d.ref) { const e = estado(dia); e.ref[d.ref] = +d.op; salvar(dia, e); render(); }
  else if (d.comiRapido) { const e = estadoKey(hojeKey()); e.comi[d.comiRapido] = true; gravar("dia:" + hojeKey(), e); toast("Refeição registrada. +8 XP"); render(); }
  else if (d.limpar !== undefined) { gravar("compras", {}); render(); }
  else if (d.sug) enviarIA(d.sug);
  else if (d.exportar !== undefined) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" }));
    a.download = "ferro-backup.json"; a.click();
  }
});

document.addEventListener("change", (ev) => {
  const i = ev.target;
  if (i.dataset.carga !== undefined) {
    const x = TREINOS[SEMANA[dia].treino].exercicios[+i.dataset.carga];
    const c = ler("cargas", {}); c[x.n] = c[x.n] || {};
    const v = parseFloat(i.value);
    if (v > 0) c[x.n][chaveDoDia(dia)] = v; else delete c[x.n][chaveDoDia(dia)];
    gravar("cargas", c); toast("Carga salva"); return;
  }
  if (i.dataset.ex !== undefined) {
    const t = TREINOS[SEMANA[dia].treino], e = estado(dia);
    const antes = t.exercicios.filter((_, n) => e.ex[n]).length;
    e.ex[i.dataset.ex] = i.checked; salvar(dia, e);
    const depois = t.exercicios.filter((_, n) => e.ex[n]).length;
    if (t.exercicios.length && depois === t.exercicios.length && antes < depois) { confete(); toast("Treino concluído! Você é fera 💪"); }
  } else if (i.dataset.comi) {
    const e = estado(dia); e.comi[i.dataset.comi] = i.checked; salvar(dia, e);
  } else if (i.dataset.compra) {
    const m = ler("compras", {}); m[i.dataset.compra] = i.checked; gravar("compras", m);
  } else return;
  render();
});

document.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === "form-peso") {
    const reg = { peso: parseFloat(f.peso.value) };
    MEDIDAS.forEach(([k]) => { const v = parseFloat(f[k].value); if (v) reg[k] = v; });
    const h = ler("pesos", {}); h[hojeKey()] = reg; gravar("pesos", h);
    toast("Registro salvo"); render();
  } else if (f.id === "form-chat") {
    const q = f.q.value; f.q.value = ""; enviarIA(q);
  }
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
receberServidor();
