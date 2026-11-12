(function () {
'use strict';
const KEY = 'asi-maturidade-v2';
const STATUS = ['Não iniciada', 'Em andamento', 'Em consolidação', 'Em transição', 'Concluída'];
const PV = 'Pendente de validação';
const ST_CLS = { 'Não iniciada': 'ni', 'Em andamento': 'ea', 'Em consolidação': 'ec', 'Em transição': 'et', 'Concluída': 'ok', 'Suspensa': 'su', [PV]: 'pv' };
const ST_COL = { 'Não iniciada': 'var(--st-ni)', 'Em andamento': 'var(--st-ea)', 'Em consolidação': 'var(--st-ec)', 'Em transição': 'var(--st-et)', 'Concluída': 'var(--st-ok)', 'Suspensa': 'var(--st-su)', [PV]: 'var(--st-pv)' };
const LV_COL = { N0: 'var(--lv-n0)', T01: 'var(--lv-t01)', N1: 'var(--lv-n1)', T12: 'var(--lv-t12)', N2: 'var(--lv-n2)', nd: 'var(--lv-nd)' };
const VIEWS = {
  geral: { t: 'Visão Geral', d: 'Situação consolidada das squads da ASI: necessidades, níveis de maturidade e pontos de atenção.', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  needs: { t: 'Necessidades das Squads', d: 'Consulte e acompanhe as necessidades organizacionais e ações de melhoria de cada squad.', icon: 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9' },
  mat: { t: 'Níveis de Maturidade', d: '', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2' },
  cad: { t: 'Cadastro de Squads', d: 'Cadastre sua squad e atualize informações.', icon: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0' },
};

// ---------------- utilidades ----------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TODAY = isoOf(new Date());
const fmt = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '—';
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pct = (a, b) => b ? Math.round(a * 100 / b) : null;
const clone = o => JSON.parse(JSON.stringify(o));
const G = (arr, id) => arr.find(x => x.id === id);
const sum = a => a.reduce((x, y) => x + y, 0);
const sortBy = (a, f) => [...a].sort((x, y) => String(f(x)).localeCompare(String(f(y)), 'pt-BR', { numeric: true }));

let DB;
// Cadastros do print que ainda não existem no navegador são acrescentados; nada do que já existe é alterado ou removido.
function mergeSeed() {
  let add = false;
  if (!DB.avaliacoes) { DB.avaliacoes = []; add = true; }
  for (const k of ['times', 'coaches', 'lts', 'squads', 'niveis', 'criterios']) for (const x of window.SEED[k]) if (!G(DB[k], x.id)) { DB[k].push(clone(x)); add = true; }
  for (const x of window.SEED.squads) { const s = G(DB.squads, x.id); if (s && !s.cpClasse && x.cpClasse) { s.cpClasse = x.cpClasse; add = true; } }
  { const ks = new Set(DB.needs.map(needKey)); for (const x of window.SEED.needs) if (!G(DB.needs, x.id) && !ks.has(needKey(x))) { DB.needs.push(clone(x)); ks.add(needKey(x)); add = true; } }
  for (const x of window.SEED.coaches) { const c = G(DB.coaches, x.id); if (c && !c.matricula && x.matricula) { c.matricula = x.matricula; add = true; } }
  for (const id of ['121-sem-time', '702-sem-time', '157-049']) { const q = G(DB.squads, id); if (q && !DB.needs.some(n => n.squadId === id) && !DB.marcacoes.some(m => m.squadId === id)) { DB.squads = DB.squads.filter(x => x.id !== id); add = true; } }
  if (!DB.migr) DB.migr = {};
  if (!DB.migr.coachOficial) { DB.migr.coachOficial = 1; add = true;
  for (const x of window.SEED.squads) { const s = G(DB.squads, x.id); if (s && x.coachId && (x.origem || []).includes('print') && s.coachId !== x.coachId) { s.historico.push({ data: new Date().toISOString().slice(0, 10), campo: 'coach', de: s.coachId, para: x.coachId, nota: 'Agile Coach atualizado conforme o cadastro organizacional oficial (print).' }); s.coachId = x.coachId; add = true; } }
  for (const n of DB.needs) if (n.origem === 'planilha-itens' && n.coachId) n.coachId = null; }
  const merged = mergeSame('074-017', '074-057');
  // necessidade cuja squad não existe mais continua visível (em "A Classificar") em vez de ficar oculta
  for (const n of DB.needs) if (!G(DB.squads, n.squadId) && n.squadId !== UNC) { n.historico = n.historico || []; n.historico.push({ data: new Date().toISOString().slice(0, 10), tipo: 'edicao', nota: 'Squad não localizada no cadastro; necessidade mantida em A Classificar.' }); n.squadId = UNC; add = true; }
  if (normalizarNecessidades()) add = true;
  if (syncPlanilha()) add = true;
  return merged || add;
}
// Regras de importação: "x" na planilha = necessidade concluída; um mesmo item (ID do Azure ou célula de origem) nunca é cadastrado duas vezes.
const isX = n => /^x$/i.test(String(n.marcaPlanilha || '').trim());
const needKey = n => n.azureId ? 'az:' + n.azureId : n.origemCelula ? 'pl:' + n.squadId + '|' + n.origemCelula + '|' + String(n.nome || '').trim().toLowerCase() : 'id:' + n.id;
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = n => n.mesPlanilha ? MES[+n.mesPlanilha.slice(5, 7) - 1] + '/' + n.mesPlanilha.slice(0, 4) : '';
function normalizarNecessidades() {
  let ch = false; const seen = new Map(), keep = [];
  for (const n of DB.needs) {
    const k = needKey(n), o = seen.get(k);
    if (!o) { seen.set(k, n); keep.push(n); continue; }
    ch = true;                                          // duplicada: consolida no registro existente, sem perder histórico nem vínculos
    if (!o.status && n.status) { o.status = n.status; o.validado = n.validado; o.dataConclusao = n.dataConclusao; }
    for (const f of Object.keys(n)) if ((o[f] === null || o[f] === undefined || o[f] === '') && n[f] !== null && n[f] !== undefined && n[f] !== '') o[f] = n[f];
    o.historico = (o.historico || []).concat(n.historico || [], [{ data: TODAY, tipo: 'edicao', nota: 'Registro duplicado na importação consolidado neste (origem: ' + k + ').' }]);
  }
  if (keep.length !== DB.needs.length) DB.needs = keep;
  for (const n of DB.needs) if (isX(n) && !n.status) {   // "x" é evidência de conclusão; nada que já tenha status definido é alterado
    n.status = 'Concluída'; n.validado = true; ch = true;
    n.historico = n.historico || [];
    n.historico.push({ data: TODAY, tipo: 'status', de: null, para: 'Concluída', nota: 'Marcação "x" na planilha reconhecida como conclusão da necessidade (antes: pendente de validação).' });
  }
  // a coluna Obs da planilha traz mês/ano (ex.: nov-25), lido como dia/mês do ano corrente; corrige para o último dia do mês e usa como conclusão dos itens com "x"
  for (const n of DB.needs) if (n.dataPlanilha && n.origemCelula && !n.mesPlanilha) {
    const m = +n.dataPlanilha.slice(5, 7), y = 2000 + +n.dataPlanilha.slice(8, 10);
    n.mesPlanilha = y + '-' + String(m).padStart(2, '0'); n.dataPlanilha = isoOf(new Date(y, m, 0)); ch = true;
    if (n.status === 'Concluída' && isX(n) && !n.dataConclusao && (n.historico || []).some(h => /Marcação "x"/.test(h.nota || ''))) {
      n.dataConclusao = n.dataPlanilha > TODAY ? TODAY : n.dataPlanilha;
      n.historico.push({ data: TODAY, tipo: 'edicao', nota: 'Data de conclusão preenchida com o último dia do mês informado na planilha (' + mesAno(n) + ').' });
    }
  }
  return ch;
}
function mergeSame(from, to) {
  const a = G(DB.squads, from), b = G(DB.squads, to); if (!a || !b) return false;
  ['needs', 'marcacoes', 'nivelHist', 'avaliacoes'].forEach(l => (DB[l] || []).forEach(x => { if (x.squadId === from) x.squadId = to; }));
  ['ltId', 'coachId', 'cpClasse', 'sistema'].forEach(k => { if (!b[k] && a[k]) b[k] = a[k]; });
  b.historico.push({ data: new Date().toISOString().slice(0, 10), campo: 'cadastro', de: null, para: null, nota: 'Código 074 também aparecia no Time 017 (planilha). Confirmado como a mesma squad; mantido registro único, vinculado ao Time 057.' });
  DB.squads = DB.squads.filter(x => x.id !== from);
  return true;
}
// Regra única de sincronização planilha → avaliação.
// Cada marcação "x" (DB.marcacoes: squadId + criterioId) é aplicada UMA vez na avaliação da squad como "Sim" (aplicadaEm).
// Depois disso a avaliação persistida é a única fonte das telas (resumo, detalhamento e formulário) e do cálculo do nível;
// uma mudança feita depois no formulário não é desfeita. Uma nova importação da planilha reaplica os "x" dela.
// Critérios sem "x" não são tocados (continuam com a resposta que tinham ou "Não avaliado").
function syncPlanilha(only, fonte) {
  let ch = false; const by = new Map();
  for (const m of DB.marcacoes || []) {
    if (m.aplicadaEm || (only && !only.includes(m.squadId)) || !G(DB.squads, m.squadId) || !G(DB.criterios, m.criterioId)) continue;
    if (!by.has(m.squadId)) by.set(m.squadId, []); by.get(m.squadId).push(m);
  }
  for (const [sid, ms] of by) {
    const s = G(DB.squads, sid); let av = avalOf(sid);
    const muda = ms.filter(m => !av || (av.respostas || {})[m.criterioId] !== 'sim');
    ms.forEach(m => { m.aplicadaEm = TODAY; }); ch = true;
    if (!muda.length) continue;
    if (!av) { av = { id: 'av-' + sid, squadId: sid, data: TODAY, obs: '', respostas: {} }; DB.avaliacoes.push(av); }
    av.respostas = av.respostas || {};
    const eraNao = muda.filter(m => av.respostas[m.criterioId] === 'nao').length;
    muda.forEach(m => { av.respostas[m.criterioId] = 'sim'; });
    av.origem = [...new Set([...(av.origem || []), 'planilha'])];
    av.planilha = { data: TODAY, arquivo: fonte || (av.planilha && av.planilha.arquivo) || 'planilha de maturidade', marcados: DB.marcacoes.filter(m => m.squadId === sid).length };
    av.salvaEm = TODAY; if (!av.data) av.data = TODAY;
    const res = classify(av.respostas); av.nivelResultado = res.nivel;
    if ((s.nivel || null) !== res.nivel) {
      const ult = DB.nivelHist.filter(h => h.squadId === sid).map(h => h.data).sort().pop(), d = ult && ult > TODAY ? ult : TODAY;
      setNivel(s, res.nivel, d, 'Sincronizado com a planilha de maturidade: ' + muda.length + ' critério(s) com "x"' + (eraNao ? ' (' + eraNao + ' antes como "Não")' : '') + '.', { avaliacaoId: av.id, id: (k => G(DB.nivelHist, k) ? uid('nh') : k)('nh-pl-' + sid + '-' + res.nivel + '-' + d) });   // id fixo evita duplicar se dois navegadores sincronizarem juntos
    }
  }
  return ch;
}
function load() {
  try { const r = localStorage.getItem(KEY); if (r) { DB = JSON.parse(r); if (mergeSeed()) save(); return; } } catch (e) { }
  DB = clone(window.SEED); normalizarNecessidades(); syncPlanilha(); save();
}
function save() { try { localStorage.setItem(typeof SYNC !== 'undefined' && SYNC.on ? KEY + '-cloud' : KEY, JSON.stringify(DB)); } catch (e) { } if (typeof SYNC !== 'undefined' && SYNC.on) syncSoon(); }

// ---------------- consultas de domínio ----------------
const niv = id => id ? G(DB.niveis, id) : null;
const nivRank = id => { const n = niv(id); return n ? n.ordem : 0; };
// Nomenclatura oficial dos estágios exibida em toda a interface (o id e as regras de cada estágio não mudam).
const NIV_NOME = { N0: 'Inconsciente', T01: 'Transição 0 → 1', N1: 'Focado em Times', T12: 'Transição 1 → 2', N2: 'Orientado ao Cliente' };
const nivLabel = id => { const n = niv(id); return n ? NIV_NOME[n.id] || n.rotulo : 'Não avaliado'; };
const nivShort = nivLabel;
const nivCol = id => LV_COL[id || 'nd'];
// Regra única de classificação (formulário, detalhes da squad, Níveis de Maturidade e Visão Geral usam o resultado salvo por ela).
// respostas: { criterioId: 'sim' | 'nao' }; critério sem resposta = não avaliado (nunca conta como atendido).
function classify(ans) {
  ans = ans || {};
  const stages = DB.niveis.map(l => { const cs = DB.criterios.filter(c => c.estagio === l.id); const sim = cs.filter(c => ans[c.id] === 'sim').length, nao = cs.filter(c => ans[c.id] === 'nao').length; return { id: l.id, total: cs.length, sim, nao, pend: cs.length - sim - nao, complete: cs.length > 0 && sim === cs.length }; });
  const S = id => stages.find(x => x.id === id) || { sim: 0, complete: false };
  if (!stages.some(x => x.sim || x.nao)) return { nivel: null, stages, avisos: [] };
  let nivel = 'N0';                                  // toda squad avaliada parte do Nível 0
  if (S('N0').complete) {
    if (S('T01').sim > 0) nivel = 'T01';              // o primeiro "Sim" da transição 0 → 1 inicia a transição
    if (S('T01').complete && S('N1').complete) {      // Nível 1 só se consolida pelos critérios do próprio Nível 1
      nivel = 'N1';
      if (S('T12').sim > 0) nivel = 'T12';            // transição 1 → 2 só começa após consolidar o Nível 1
      if (S('T12').complete && S('N2').complete) nivel = 'N2';
    }
  }
  const avisos = [], reached = DB.niveis.findIndex(l => l.id === nivel);
  stages.forEach((st, i) => { if (i > reached && st.sim > 0) avisos.push('Há critérios atendidos em "' + nivLabel(st.id) + '", mas a etapa anterior ainda não está completa; o nível não avança (sem saltos).'); });
  return { nivel, stages, avisos };
}
const avalOf = id => (DB.avaliacoes || []).find(a => a.squadId === id);
const UNC = 'aclassificar', UNC_SQ = { id: UNC, codigo: '—', nome: 'A Classificar', sistema: 'Itens ainda sem squad identificada', cpClasse: null, timeId: null, coachId: null, ltId: null, virtual: true };
const sqOf = id => G(DB.squads, id) || (id === UNC ? UNC_SQ : undefined);
const sqName = s => s ? (s.virtual ? 'A Classificar' : 'Squad ' + s.codigo) : '—';
const timeName = id => { const t = G(DB.times, id); return t ? 'Time ' + t.codigo + (t.nome ? ' · ' + t.nome : '') : '—'; };
const pName = (list, id) => { const p = id ? G(DB[list], id) : null; return p ? p.nome : null; };
const eff = (n, k) => n[k] || (sqOf(n.squadId) || {})[k] || null;
const stOf = n => n.status || PV;
const badge = st => `<span class="badge b-${ST_CLS[st || PV]}">${esc(st || PV)}</span>`;
const isLate = n => n.dataPrevista && n.dataPrevista < TODAY && n.status !== 'Concluída' && n.status !== 'Suspensa';
const needsOf = id => DB.needs.filter(n => n.squadId === id);
function stats(needs) {
  const c = k => needs.filter(n => n.status === k).length;
  const concl = c('Concluída'), and = c('Em andamento') + c('Em consolidação') + c('Em transição');
  const pv = needs.filter(n => !n.status).length, ni = c('Não iniciada'), su = c('Suspensa');
  return { total: needs.length, concl, and, pend: pv + ni, pv, ni, su, pct: pct(concl, needs.length) };
}
const lastUpdate = s => {
  const ds = [...s.historico.map(h => h.data), ...DB.nivelHist.filter(h => h.squadId === s.id).map(h => h.data), ...needsOf(s.id).flatMap(n => n.historico.map(h => h.data))];
  return ds.sort().pop() || null;
};
// histórico: nível e status "em" uma data
function nivelEm(squadId, fim) {
  const ev = DB.nivelHist.filter(h => h.squadId === squadId && h.data <= fim).sort((a, b) => a.data.localeCompare(b.data));
  return ev.length ? ev[ev.length - 1].para : undefined; // undefined = sem registro
}
function statusEm(n, fim) {
  const ev = n.historico.filter(h => h.tipo === 'criacao' || h.tipo === 'status').sort((a, b) => a.data.localeCompare(b.data));
  if (!ev.length || ev[0].data > fim) return undefined; // ainda não existia
  const l = ev.filter(h => h.data <= fim).pop();
  return l.para;
}
function semesters() {
  const ys = [new Date().getFullYear() - 1];
  DB.nivelHist.forEach(h => ys.push(+h.data.slice(0, 4)));
  DB.needs.forEach(n => n.historico.forEach(h => ys.push(+h.data.slice(0, 4))));
  const y0 = Math.min(...ys), now = new Date(), y1 = now.getFullYear(), s1 = now.getMonth() < 6 ? 1 : 2, out = [];
  for (let y = y0; y <= y1; y++) for (let s = 1; s <= 2; s++) { if (y === y1 && s > s1) break; out.push(semObj(y, s)); }
  return out;
}
const semObj = (y, s) => ({ id: 'S:' + y + '-' + s, ano: y, sem: s, ini: y + (s === 1 ? '-01-01' : '-07-01'), fim: y + (s === 1 ? '-06-30' : '-12-31'), label: s + 'º sem/' + y });
function periodOf(code) {
  if (code.startsWith('Y:')) { const y = +code.slice(2); return { id: code, ini: y + '-01-01', fim: y + '-12-31', label: 'Ano ' + y }; }
  const [y, s] = code.slice(2).split('-').map(Number); return semObj(y, s);
}
const periodOptions = () => { const ss = semesters(), ys = [...new Set(ss.map(s => s.ano))]; return [...ss.map(s => ({ id: s.id, label: s.label })), ...ys.map(y => ({ id: 'Y:' + y, label: 'Ano ' + y }))]; };

// ---------------- filtros integrados ----------------
let F = {};
const FILTERS = ['need', 'squad', 'time', 'nivel', 'cp', 'coach', 'lt', 'status', 'de', 'ate', 'sem', 'ano'];
function range() {
  let lo = F.de || null, hi = F.ate || null;
  if (F.ano || F.sem) {
    const y = F.ano || new Date().getFullYear();
    const a = F.sem === '1' ? y + '-01-01' : F.sem === '2' ? y + '-07-01' : y + '-01-01';
    const b = F.sem === '1' ? y + '-06-30' : F.sem === '2' ? y + '-12-31' : y + '-12-31';
    lo = lo && lo > a ? lo : a; hi = hi && hi < b ? hi : b;
  }
  return lo || hi ? { lo: lo || '0000-01-01', hi: hi || '9999-12-31' } : null;
}
const needDates = n => [n.dataInicio, n.dataPrevista, n.dataConclusao, n.dataPlanilha].filter(Boolean);
const cpLabel = c => c ? String(c).replace(/^CP /, 'Célula de Produto ') : c;
function cpMatch(f, cpClasse) { return cpClasse === f.slice(2); }
function getFiltered(opt = {}) {
  const r = opt.noNeedLevel ? null : range();
  const needLevel = !opt.noNeedLevel && (F.status || r);
  const sqs0 = [...DB.squads, ...(opt.withUnc && DB.needs.some(n => n.squadId === UNC) ? [UNC_SQ] : [])].filter(s =>
    (!F.squad || s.id === F.squad) && (!F.time || s.timeId === F.time) &&
    (!F.nivel || (F.nivel === '__nd' ? !s.nivel : s.nivel === F.nivel)) &&
    (!F.cp || cpMatch(F.cp, s.cpClasse)) &&
    (!F.coach || (F.coach === '__nd' ? !s.coachId : s.coachId === F.coach)) &&
    (!F.lt || (F.lt === '__nd' ? !s.ltId : s.ltId === F.lt)));
  const ids = new Set(sqs0.map(s => s.id));
  const needs = DB.needs.filter(n => ids.has(n.squadId) &&
    (opt.noNeedLevel || !F.status || (F.status === PV ? !n.status : n.status === F.status)) &&
    (!r || needDates(n).some(d => d >= r.lo && d <= r.hi)) &&
    (!F.cp || cpMatch(F.cp, sqOf(n.squadId).cpClasse)) &&
    (!F.coach || (F.coach === '__nd' ? !eff(n, 'coachId') : eff(n, 'coachId') === F.coach)) &&
    (!F.lt || (F.lt === '__nd' ? !eff(n, 'ltId') : eff(n, 'ltId') === F.lt)));
  const withNeed = new Set(needs.map(n => n.squadId));
  const squads = needLevel ? sqs0.filter(s => withNeed.has(s.id)) : sqs0;
  return { squads, needs: needs.filter(n => squads.some(s => s.id === n.squadId)) };
}
const activeFilters = () => FILTERS.some(k => F[k]);
const needNames = () => { const m = {}; DB.needs.forEach(n => { m[n.nome] = (m[n.nome] || 0) + 1; }); return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true })); };
function filterBar(opts = {}) {
  const o = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`;
  const sel = (k, label, opts_) => `<label>${label}<select data-f="${k}"><option value="">Todos</option>${opts_.map(x => o(x[0], x[1], F[k])).join('')}</select></label>`;
  const y0 = new Date().getFullYear();
  const cps = [...new Set(['CP I', 'CP II', 'CP III', ...DB.squads.map(s => s.cpClasse).filter(Boolean)])].sort().map(c => ['c:' + c, cpLabel(c)]);
  if (opts.needs) {
    const dup = {}; DB.squads.forEach(s => { dup[s.codigo] = (dup[s.codigo] || 0) + 1; });
    const sqLabel = s => sqName(s) + (s.sistema ? ' – ' + s.sistema : '') + (dup[s.codigo] > 1 ? ' (Time ' + (G(DB.times, s.timeId) || {}).codigo + ')' : '');
    return `<div class="filters nfilters">
    ${sel('squad', 'Squad', sortBy(DB.squads, s => s.codigo + s.timeId).map(s => [s.id, sqLabel(s)]))}
    ${sel('cp', 'Célula de Produto', ['CP I', 'CP II', 'CP III'].map(c => ['c:' + c, cpLabel(c)]))}
    ${sel('need', 'Necessidade', needNames().map(([nm, c]) => [nm, nm + ' (' + c + ')']))}
    ${sel('coach', 'Agile Coach', DB.coaches.map(c => [c.id, c.nome]))}
    <button class="btn ghost" data-act="clearF"${activeFilters() ? '' : ' disabled style="opacity:.5"'}>Limpar filtros</button></div>`;
  }
  if (opts.geral) {
    const adv = opts.needs ? ['status', 'de', 'ate', 'sem', 'ano'] : ['time', 'status', 'de', 'ate', 'sem', 'ano'], nAdv = adv.filter(k => F[k]).length;
    return `<div class="filters">
    ${sel('squad', 'Squad', sortBy(DB.squads, s => s.codigo + s.timeId).map(s => [s.id, sqName(s) + ' · T' + (G(DB.times, s.timeId) || {}).codigo]))}
    ${opts.needs ? sel('time', 'Time', DB.times.map(t => [t.id, timeName(t.id)])) : ''}
    ${sel('cp', 'Célula de Produto', cps)}
    ${sel('coach', 'Agile Coach', [...DB.coaches.map(c => [c.id, c.nome]), ['__nd', 'Não informado']])}
    ${sel('nivel', 'Nível de maturidade', [...DB.niveis.map(n => [n.id, nivLabel(n.id)]), ['__nd', 'Não avaliado']])}
    ${opts.needs ? sel('need', 'Necessidade', needNames().map(([nm, c]) => [nm, nm + ' (' + c + ')'])) : ''}
    <button class="btn ghost" data-act="advToggle" aria-expanded="${ui.adv ? 'true' : 'false'}" aria-controls="advf">Filtros avançados ${nAdv ? `<span class="badge b-n" title="Filtros avançados ativos">${nAdv} ativo${nAdv > 1 ? 's' : ''}</span>` : ''} ${ui.adv ? '▲' : '▼'}</button>
    <button class="btn ghost" data-act="clearF"${activeFilters() ? '' : ' disabled style="opacity:.5"'}>Limpar filtros</button></div>
    ${ui.adv ? `<div class="filters" id="advf" style="margin-top:-6px">
    ${opts.needs ? '' : sel('time', 'Time', DB.times.map(t => [t.id, timeName(t.id)]))}
    ${sel('status', 'Status da necessidade', STATUS.map(s => [s, s]))}
    <label>Período de<input type="date" data-f="de" value="${esc(F.de || '')}"></label><label>até<input type="date" data-f="ate" value="${esc(F.ate || '')}"></label>
    ${sel('sem', 'Semestre', [['1', '1º semestre'], ['2', '2º semestre']])}
    ${sel('ano', 'Ano', [y0 - 2, y0 - 1, y0, y0 + 1].map(y => [String(y), String(y)]))}</div>` : ''}
    ${range() ? '<div class="note">Período: uma necessidade entra no filtro se alguma de suas datas (início, prevista, conclusão ou data registrada na planilha) estiver dentro do intervalo; necessidades sem data ficam de fora.</div>' : ''}`;
  }
  return `<div class="filters">
  ${sel('squad', 'Squad', sortBy(DB.squads, s => s.codigo + s.timeId).map(s => [s.id, sqName(s) + ' · T' + (G(DB.times, s.timeId) || {}).codigo]))}
  ${sel('time', 'Time', DB.times.map(t => [t.id, timeName(t.id)]))}
  ${sel('nivel', 'Nível de maturidade', [...DB.niveis.map(n => [n.id, nivLabel(n.id)]), ['__nd', 'Não avaliado']])}
  ${sel('cp', 'Célula de Produto', cps)}
  ${sel('coach', 'Agile Coach', [...DB.coaches.map(c => [c.id, c.nome]), ['__nd', 'Não informado']])}
  ${opts.noNeedLevel ? '' : sel('status', 'Status', STATUS.map(s => [s, s]))}
  ${opts.noNeedLevel ? '' : `<label>Período de<input type="date" data-f="de" value="${esc(F.de || '')}"></label><label>até<input type="date" data-f="ate" value="${esc(F.ate || '')}"></label>
  ${sel('sem', 'Semestre', [['1', '1º semestre'], ['2', '2º semestre']])}
  ${sel('ano', 'Ano', [y0 - 2, y0 - 1, y0, y0 + 1].map(y => [String(y), String(y)]))}`}
  <button class="btn ghost" data-act="clearF"${activeFilters() ? '' : ' disabled style="opacity:.5"'}>Limpar filtros</button></div>
  ${opts.noNeedLevel ? '<div class="note">Esta comparação define seus próprios períodos; os filtros de status, período, semestre e ano não se aplicam aqui.</div>' : (range() ? '<div class="note">Período: uma necessidade entra no filtro se alguma de suas datas (início, prevista, conclusão ou data registrada na planilha) estiver dentro do intervalo; necessidades sem data ficam de fora.</div>' : '')}`;
}

// ---------------- gráficos (SVG/HTML) ----------------
function donut(items, center) {
  const tot = sum(items.map(i => i.value));
  if (!tot) return '<div class="empty">Sem dados para os filtros atuais.</div>';
  const r = 52, c = 2 * Math.PI * r; let off = 0;
  const segs = items.filter(i => i.value).map(i => { const l = i.value / tot * c; const s = `<circle cx="70" cy="70" r="${r}" fill="none" style="stroke:${i.color}" stroke-width="22" stroke-dasharray="${l} ${c - l}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(i.label)}: ${i.value}</title></circle>`; off += l; return s; }).join('');
  return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 140 140" width="150" height="150" role="img">${segs}<text x="70" y="68" text-anchor="middle" font-size="22" font-weight="600" fill="#333333">${center}</text><text x="70" y="86" text-anchor="middle" font-size="10" fill="#6B7280">necessidades</text></svg>
  <div class="list" style="gap:4px;flex:1;min-width:150px">${items.map(i => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${i.color}"></i>${esc(i.label)}</span><b>${i.value}</b></div>`).join('')}</div></div>`;
}
function hbars(rows, max) {
  const m = max || Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return '<div class="empty">Sem dados para os filtros atuais.</div>';
  return rows.map(r => `<div style="display:grid;grid-template-columns:minmax(90px,150px) 1fr 118px;gap:8px;align-items:center;margin:6px 0;font-size:12.5px" title="${esc(r.title || '')}"><span>${esc(r.label)}</span><div class="bar">${r.segs ? r.segs.map(s => `<i style="width:${s.value / m * 100}%;background:${s.color}" title="${esc(s.label)}: ${s.value}"></i>`).join('') : `<i style="width:${r.value / m * 100}%;background:${r.color || 'var(--brand)'}"></i>`}</div><span style="text-align:right;color:var(--muted)">${r.text != null ? r.text : r.value}</span></div>`).join('');
}
function colChart(groups, series, h = 200) {
  // groups: rótulos; series: [{name,color,values[]}] ; stacked se stacked=true em series.stacked
  const stacked = series.stacked, n = groups.length, W = Math.max(380, n * (stacked ? 90 : 56 * series.length + 24)), top = 14, base = h - 34;
  const tot = i => stacked ? sum(series.map(s => s.values[i])) : Math.max(...series.map(s => s.values[i]));
  const mx = Math.max(1, ...groups.map((_, i) => tot(i))), sc = (base - top) / mx, cw = W / n;
  let g = '';
  groups.forEach((lab, i) => {
    const x0 = i * cw;
    if (stacked) {
      let y = base; const bw = Math.min(46, cw - 24);
      series.forEach(s => { const v = s.values[i]; if (!v) return; const hh = v * sc; y -= hh; g += `<rect x="${x0 + (cw - bw) / 2}" y="${y}" width="${bw}" height="${hh}" style="fill:${s.color}"><title>${esc(s.name)}: ${v}</title></rect>`; });
      g += `<text x="${x0 + cw / 2}" y="${y - 4}" text-anchor="middle" font-size="11" fill="#333333">${tot(i) || ''}</text>`;
    } else {
      const bw = Math.min(34, (cw - 20) / series.length);
      series.forEach((s, j) => { const v = s.values[i], hh = v * sc, x = x0 + (cw - bw * series.length) / 2 + j * bw; g += `<rect x="${x + 2}" y="${base - hh}" width="${bw - 4}" height="${hh}" rx="2" style="fill:${s.color}"><title>${esc(s.name)}: ${v}</title></rect><text x="${x + bw / 2}" y="${base - hh - 4}" text-anchor="middle" font-size="11" fill="#333333">${v}</text>`; });
    }
    g += `<text x="${x0 + cw / 2}" y="${base + 15}" text-anchor="middle" font-size="11" fill="#6B7280">${esc(lab)}</text>`;
  });
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${h}" width="100%" style="min-width:${Math.min(W, 380)}px;max-height:${h + 40}px" role="img"><line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#dde5ef"/>${g}</svg></div>
  <div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
const lvLegend = () => `<div class="legend">${[...DB.niveis.map(n => [n.id, nivShort(n.id)]), ['nd', 'Não avaliado / sem registro']].map(([id, l]) => `<span><i style="background:${nivCol(id)}"></i>${esc(l)}</span>`).join('')}</div>`;
function levelBar(squads) {
  return hbars([...DB.niveis.map(n => ({ id: n.id, label: nivLabel(n.id), color: nivCol(n.id) })), { id: null, label: 'Não avaliado', color: nivCol('nd') }]
    .map(l => ({ label: l.label, value: squads.filter(s => (s.nivel || null) === l.id).length, color: l.color })), Math.max(1, squads.length));
}

// ---------------- mutações com histórico ----------------
function setStatus(n, para, data, nota) {
  const de = n.status;
  if (para === 'Concluída') {
    if (data > TODAY) return 'A data efetiva de conclusão não pode ser futura.';
    if (n.dataInicio && data < n.dataInicio) return 'A conclusão não pode ser anterior à data de início.';
    n.dataConclusao = data;
  } else if (de === 'Concluída') n.dataConclusao = null;
  n.status = para; n.validado = true;
  n.historico.push({ data, tipo: 'status', de, para, nota: nota || '' });
  save(); return null;
}
function setNivel(s, para, data, nota, extra) {
  const hist = DB.nivelHist.filter(h => h.squadId === s.id).sort((a, b) => a.data.localeCompare(b.data));
  const antes = (hist.filter(h => h.data <= data).pop() || {}).para || null;
  DB.nivelHist.push({ id: uid('nh'), squadId: s.id, data, de: antes, para: para || null, nota: nota || '', ...(extra || {}) });
  const all = DB.nivelHist.filter(h => h.squadId === s.id).sort((a, b) => a.data.localeCompare(b.data));
  s.nivel = all[all.length - 1].para || null; save();
}

// ---------------- estado de UI ----------------
let ui = { open: {}, view: 'geral', nv: 'tabela', sort: { k: 'squad', d: 1 }, q: '', cad: 'squads', per: null, cmp: [] };
let _tw = {}; const twice = (k, msg) => { if (_tw[k]) { _tw[k] = 0; return true; } _tw[k] = 1; toast(msg); setTimeout(() => { _tw[k] = 0; }, 4000); return false; };
const toast = m => { const t = document.createElement('div'); t.textContent = m; t.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#1F3A5F;color:#fff;padding:10px 18px;border-radius:6px;z-index:99;font-size:13px'; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); };

// ---------------- Visão Geral ----------------
function evoCmp(squads, haHist) {
  const opts = periodOptions(), ss = semesters(), cur = ss[ss.length - 1], prev = ss[ss.length - 2] || cur;
  if (!ui.per) ui.per = { a: prev.id, b: cur.id };
  const A = periodMetrics(ui.per.a, squads), B = periodMetrics(ui.per.b, squads);
  const sel = k => `<select data-per="${k}" aria-label="Período ${k === 'a' ? 'inicial' : 'final'}">${opts.map(o => opt(o.id, o.label, ui.per[k])).join('')}</select>`;
  const y = new Date().getFullYear();
  const quick = `<button class="btn ghost sm" data-act="quick" data-a="S:${y}-1" data-b="S:${y}-2">1º × 2º semestre ${y}</button> <button class="btn ghost sm" data-act="quick" data-a="${prev.id}" data-b="${cur.id}">Semestre atual × anterior</button> <button class="btn ghost sm" data-act="quick" data-a="Y:${y - 1}" data-b="Y:${y}">Ano atual × anterior</button>`;
  const cats = [...DB.niveis.map(n => n.id), 'nd'], catL = id => id === 'nd' ? 'Sem registro' : nivShort(id);
  const cA = 'var(--lv-n0)', cB = 'var(--brand)';
  const legend = `<div class="evoleg"><span><i style="background:${cA}"></i>${esc(A.p.label)}</span><span><i style="background:${cB}"></i>${esc(B.p.label)}</span></div>`;
  const nec = [['Concluídas no período', 'concl'], ['Concluídas (acum.)', 'done'], ['Em andamento', 'and'], ['Pendentes', 'pend']];
  return {
    ctl: `<div class="toolbar"><b>Comparar períodos</b> ${sel('a')} <b>com</b> ${sel('b')} <span class="evoq">${quick}</span></div>`,
    sq: `<div class="panel"><h3>Evolução semestral das squads por nível de maturidade</h3><div class="hint">Ao fim de cada período (${squads.length} squad(s) no filtro).</div>
  ${haHist ? colChart(cats.map(catL), [{ name: A.p.label, color: cA, values: cats.map(c => A.dist[c] || 0) }, { name: B.p.label, color: cB, values: cats.map(c => B.dist[c] || 0) }], 260) + legend : '<div class="empty">Nenhum nível registrado ainda. Avalie as squads em <b>Níveis de Maturidade</b> (detalhes da squad › <b>Avaliar maturidade</b>); a data da avaliação pode ser retroativa para semestres passados.</div>'}</div>`,
    nec: `<div class="panel"><h3>Evolução semestral das necessidades</h3><div class="hint">Posição ao fim de cada período.</div>
  ${colChart(nec.map(x => x[0]), [{ name: A.p.label, color: cA, values: nec.map(x => A[x[1]]) }, { name: B.p.label, color: cB, values: nec.map(x => B[x[1]]) }], 260)}${legend}</div>` };
}
function vGeral() {
  const gf = getFiltered({ withUnc: true }), squads = gf.squads.filter(s => !s.virtual), needs = gf.needs, st = stats(needs), r = range();
  const lo = r ? r.lo : new Date().getFullYear() + '-01-01', hi = r ? r.hi : '9999-12-31';
  const card = (l, v, sub, cls = '') => `<div class="card ${cls}"><div class="lbl">${l}</div><div class="val">${v}</div><div class="sub">${sub || '&nbsp;'}</div></div>`;
  const sems = semesters().slice(-4);
  const atrasadas = needs.filter(isLate), semNivel = squads.filter(s => !s.nivel), semResp = squads.filter(s => !s.cpClasse || !s.coachId);
  const evo = sems.map(se => ({ se, d: DB.niveis.map(n => squads.filter(s => nivelEm(s.id, se.fim) === n.id).length), nd: squads.filter(s => !nivelEm(s.id, se.fim)).length }));
  const haHist = DB.nivelHist.length > 0;
  const semAv = squads.filter(s => !s.nivel).length;
  const stRows = [...STATUS].map(k => ({ k, v: needs.filter(n => stOf(n) === k).length, late: needs.filter(n => stOf(n) === k && isLate(n)).length }));
  const stMax = Math.max(1, ...stRows.map(r => r.v)), zeros = stRows.filter(r => !r.v).length, shown = stRows.filter(r => r.v || ui.showZero);
  const E = evoCmp(squads, haHist);
  return `<h3 class="sec">Maturidade das squads</h3>
  ${E.ctl}
  <div class="grid two big"><div class="panel"><h3>Squads por nível de maturidade</h3>
  <ol class="stepper" aria-label="Squads por nível de maturidade">${DB.niveis.map(n => { const c = squads.filter(s => s.nivel === n.id).length; return `<li class="step${c ? ' has' : ''}" style="--c:${nivCol(n.id)};--t:${['N1', 'T12', 'N2'].includes(n.id) ? '#fff' : '#333333'}"><b>${c}</b><span>${esc(nivLabel(n.id))}</span></li>`; }).join('')}</ol>
  <div class="small muted" style="margin-top:8px">${squads.length - semAv} de ${squads.length} squad(s) avaliadas.</div></div>${E.sq}</div>
  <h3 class="sec">Indicadores de necessidades</h3>
  <div class="grid cards">
  ${card('Necessidades registradas', st.total, 'total no filtro')}
  ${card('Necessidades não iniciadas', st.ni, 'ainda sem início', 'warn')}
  ${card('Necessidades em andamento', st.and, 'andamento, consolidação ou transição')}
  ${card('Necessidades concluídas', st.concl, (st.pct == null ? '—' : st.pct) + '% do total', 'ok')}
  </div>
  ${st.pv ? `<div class="note warn"><b>${st.pv}</b> de ${st.total} necessidades foram importadas da planilha sem status confiável (a marcação "x" não indica conclusão) e aguardam validação. Elas contam como pendentes, mas nunca como concluídas. <a href="#" data-act="goPV">Ver e validar</a></div>` : ''}
  <h3 class="sec">Análise das necessidades</h3>
  <div class="grid two big"><div class="panel"><h3>Necessidades por status</h3><div class="hint">Percentual de conclusão: <b>${st.pct == null ? '—' : st.pct + '%'}</b> (${st.concl} de ${st.total}).</div>
  ${!st.total ? '<div class="empty">Nenhuma necessidade para os filtros atuais.</div>' : `<div role="list">${shown.map(r => `<div role="listitem" style="display:grid;grid-template-columns:minmax(120px,170px) 1fr 40px;gap:8px;align-items:center;margin:7px 0;font-size:13px"><span>${esc(r.k)}</span><div class="bar" role="img" aria-label="${esc(r.k)}: ${r.v} de ${st.total}"><i style="width:${r.v / stMax * 100}%;background:var(--brand)"></i></div><b style="text-align:right">${r.v}</b>${r.k === PV && r.v ? '<span></span><span class="small" style="grid-column:2/4;color:#8a5a10">⚠ status não confiável importado da planilha: requer validação</span>' : ''}${r.late ? `<span></span><span class="small late" style="grid-column:2/4">⚠ ${r.late} com prazo vencido</span>` : ''}</div>`).join('')}</div>
  ${zeros ? `<button class="btn ghost sm" style="margin-top:8px" data-act="toggleZero" aria-expanded="${ui.showZero ? 'true' : 'false'}">${ui.showZero ? '− Ocultar status zerados' : '+ Mostrar status zerados (' + zeros + ')'}</button>` : ''}`}</div>${E.nec}</div>
  <div class="grid"><div class="panel"><h3>Onde olhar com mais atenção</h3><div class="hint">Itens que pedem validação ou intervenção.</div><div class="list">
  ${atrasadas.length ? `<div class="it2 c"><span><b>${atrasadas.length}</b> necessidade(s) com prazo vencido</span><a href="#" data-act="goLate">ver</a></div>` : ''}
  ${st.pv ? `<div class="it2 a"><span><b>${st.pv}</b> necessidade(s) pendentes de validação</span><a href="#" data-act="goPV">validar</a></div>` : ''}
  ${semNivel.length ? `<div class="it2 a"><span><b>${semNivel.length}</b> squad(s) sem nível de maturidade avaliado</span><a href="#" data-act="goMat">avaliar</a></div>` : ''}
  ${semResp.length ? `<div class="it2 a"><span><b>${semResp.length}</b> squad(s) sem CP ou Agile Coach definidos</span><a href="#" data-act="goQual">completar</a></div>` : ''}
  ${!atrasadas.length && !st.pv && !semNivel.length && !semResp.length ? '<div class="empty">Nenhuma pendência identificada.</div>' : ''}</div></div></div>`;
}

// ---------------- Necessidades ----------------
const stOrder = n => n.status ? STATUS.indexOf(n.status) + 1 : 0;
function needRows() {
  let { needs } = getFiltered({ withUnc: true });
  const q = ui.q.trim().toLowerCase();
  if (F.need) needs = needs.filter(n => n.nome === F.need);
  if (q) needs = needs.filter(n => { const s = sqOf(n.squadId); return [n.nome, n.obs, n.desc, s.nome, s.codigo, s.sistema, s.cpClasse, pName('lts', eff(n, 'ltId')), pName('coaches', eff(n, 'coachId'))].join(' ').toLowerCase().includes(q); });
  const K = { squad: n => sqName(sqOf(n.squadId)), time: n => timeName(sqOf(n.squadId).timeId), nome: n => n.nome, nivel: n => nivRank(n.nivel), status: stOrder, ini: n => n.dataInicio || '9', prev: n => n.dataPrevista || '9', conc: n => n.dataConclusao || '9' };
  const f = K[ui.sort.k] || K.squad;
  return [...needs].sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * ui.sort.d; });
}
const respCell = n => ['lts', 'coaches'].map((l, i) => { const v = pName(l, eff(n, ['ltId', 'coachId'][i])); return i === 0 && !v ? '' : `<div class="small"><span class="muted">${['LT', 'Coach'][i]}:</span> ${v ? esc(v) : '<span class="muted">—</span>'}</div>`; }).join('');
const initials = nm => nm.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const lead = (cls, lab, nm) => nm ? `<span class="lead ${cls}" title="${esc(nm)}"><i class="av" aria-hidden="true">${esc(initials(nm))}</i><span><b>${lab}:</b> ${esc(nm)}</span></span>` : `<span class="lead none"><b>${lab}:</b> —</span>`;
function vNeeds() {
  const rows = needRows();
  const tg = `<div class="toolbar"><div class="seg"><button data-act="nv" data-v="tabela" class="${ui.nv === 'tabela' ? 'on' : ''}">Lista</button><button data-act="nv" data-v="kanban" class="${ui.nv === 'kanban' ? 'on' : ''}">Kanban</button></div>
  <input type="search" aria-label="Pesquisar necessidades" placeholder="Pesquisar squad, necessidade, responsável, observação…" value="${esc(ui.q)}" data-q><select data-sort aria-label="Ordenar por">${[['squad', 'Ordenar: Squad'], ['time', 'Ordenar: Time'], ['nome', 'Ordenar: Etapa / módulo'], ['nivel', 'Ordenar: Nível'], ['status', 'Ordenar: Status'], ['ini', 'Ordenar: Início'], ['prev', 'Ordenar: Data prevista'], ['conc', 'Ordenar: Conclusão']].map(([k, l]) => opt(k, l, ui.sort.k)).join('')}</select><span class="muted small">${rows.length} necessidade(s)</span></div>`;
  if (!rows.length && ui.nv === 'kanban') return filterBar({ needs: true }) + tg + '<div class="empty">Nenhuma necessidade encontrada para os filtros atuais.</div>';
  if (ui.nv === 'kanban') {
    const cols = [...STATUS];
    return filterBar({ needs: true }) + tg + `<div class="note">Arraste os cartões entre as colunas. A mudança de status pede confirmação, registra histórico e, ao concluir, grava a data efetiva.</div>
    <div class="kanban">${cols.map(c => { const items = rows.filter(n => stOf(n) === c); return `<div class="col" data-col="${esc(c)}"><h4><span>${esc(c)}</span><span>${items.length}</span></h4>${items.map(n => `<div class="kcard" draggable="true" data-id="${n.id}" data-act="open"><b>${esc(n.nome)}</b><span class="sq">${esc(sqName(sqOf(n.squadId)))} · ${esc(timeName(sqOf(n.squadId).timeId))}</span>${n.dataPrevista || n.dataPlanilha ? `<div class="small ${isLate(n) ? 'late' : 'muted'}">${n.dataPrevista ? 'Prevista ' + fmt(n.dataPrevista) : 'Planilha: ' + fmt(n.dataPlanilha)}</div>` : ''}</div>`).join('')}</div>`; }).join('')}</div>`;
  }
  const bySq = new Map(); rows.forEach(n => { if (!bySq.has(n.squadId)) bySq.set(n.squadId, []); bySq.get(n.squadId).push(n); });
  const showEmpty = !F.need && !ui.q.trim();
  const autoOpen = !!(activeFilters() || ui.q.trim());
  const sqs = getFiltered({ withUnc: true }).squads.filter(s => bySq.has(s.id) || showEmpty);
  const uniq = (list, f) => [...new Set(list.map(f).filter(Boolean))];
  const cpKey = s => s.virtual ? 'A Classificar' : (s.cpClasse || 'Sem CP');
  const cpList = [...['CP I', 'CP II', 'CP III'], ...(sqs.some(s => !s.cpClasse && !s.virtual) ? ['Sem CP'] : []), ...(sqs.some(s => s.virtual) ? ['A Classificar'] : [])];
  const body = cpList.map(cp => {
    const ss = [...sqs.filter(s => cpKey(s) === cp)].sort((x, y) => ((G(DB.times, x.timeId) || {}).codigo || '').localeCompare((G(DB.times, y.timeId) || {}).codigo || '') || x.codigo.localeCompare(y.codigo)); if (!ss.length) return '';
    const nn = sum(ss.map(s => (bySq.get(s.id) || []).length)), key = 'cp:' + cp;
    const isOpen = ui.open[key] !== undefined ? ui.open[key] : autoOpen;
    const head = `<tr class="tgrp" tabindex="0" role="button" aria-expanded="${isOpen}" data-act="toggleTime" data-id="${key}" data-open="${isOpen ? 1 : 0}"><td colspan="3"><div class="tcard"><span class="xchev" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div class="tinfo"><b>${cp === 'A Classificar' ? 'A Classificar (squad não identificada)' : cp === 'Sem CP' ? 'Célula de Produto não informada' : esc(cpLabel(cp))}</b><span class="muted small">${ss.length} squad(s) · ${nn} necessidade(s)</span></div></div></td></tr>`;
    return head + (!isOpen ? '' : ss.map(s => { const ns = bySq.get(s.id) || [], tm = G(DB.times, s.timeId) || {}, sk = 'sq:' + s.id, so = ui.open[sk] === true;
      const row = `<tr class="tgrp sqh" tabindex="0" role="button" aria-expanded="${so}" data-act="toggleTime" data-id="${sk}" data-open="${so ? 1 : 0}"><td><div class="sqc"><span class="xchev" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="vb" aria-hidden="true"></span><div><b>${esc(sqName(s))}</b> ${s.virtual ? '' : `<span class="chip" title="Time">Time ${esc(tm.codigo || '—')}</span>`}<div class="sub">${esc(s.sistema || 'Sistema não informado')}</div>${DB.squads.filter(x => x.codigo === s.codigo && x.id !== s.id).map(x => `<div class="small late">⚠ Código também usado no Time ${esc((G(DB.times, x.timeId) || {}).codigo || '?')}: confirmar se é a mesma squad</div>`).join('')}</div></div></td>
      <td class="nsum">${ns.length ? '<b>' + ns.length + '</b> necessidade(s)' + (ns.some(n => n.status === 'Concluída') ? '<div class="muted small">' + ns.filter(n => n.status === 'Concluída').length + ' concluída(s)</div>' : '') : '<span class="muted small">Sem necessidades registradas</span>'}</td>
      <td>${lead('co', 'COACH', pName('coaches', s.coachId))}</td></tr>`;
      if (!so) return row;
      return row + `<tr class="sqdet"><td colspan="3"><div class="nlist">${ns.length ? ns.map(n => { const meta = [n.azureId ? '#' + n.azureId + ' · ' + esc(n.tipo || '') : '', n.responsavel ? 'Resp.: ' + esc(n.responsavel.replace(/\s+[A-Z]\d{6}$/, '')) : '', n.nivel ? 'Nível: ' + esc(nivShort(n.nivel)) : '', n.dataInicio ? 'Início ' + fmt(n.dataInicio) : '', n.dataPrevista ? `<span class="${isLate(n) ? 'late' : ''}">Prevista ${fmt(n.dataPrevista)}</span>` : '', n.dataConclusao ? 'Concluída ' + fmt(n.dataConclusao) : ''].filter(Boolean).join(' · '), lt = pName('lts', eff(n, 'ltId'));
        return `<div class="nitem" tabindex="0" data-act="open" data-id="${n.id}"><div class="nt"><b>${esc(n.nome)}</b>${n.obs ? `<div class="sub">↳ ${esc(n.obs)}</div>` : ''}${meta ? `<div class="meta">${meta}</div>` : ''}</div><div class="nlt">${lt ? `<span class="muted small">Líder técnico</span><span>${esc(lt)}</span>` : ''}</div>${badge(n.status)}</div>`; }).join('') : '<span class="muted small">Esta squad não tem necessidades registradas.</span>'}</div></td></tr>`; }).join(''));
  }).join('');
  if (!body) return filterBar({ needs: true }) + tg + '<div class="empty">Nenhuma necessidade encontrada para os filtros atuais.</div>';
  const ctl = `<div class="toolbar"><span class="muted small">Clique na Célula de Produto para ver as squads e na squad para ver as necessidades.</span><button class="btn ghost sm" data-act="expAll" data-v="1">Expandir todos</button><button class="btn ghost sm" data-act="expAll" data-v="0">Recolher todos</button></div>`;
  return filterBar({ needs: true }) + tg + ctl + `<div class="tbl-wrap"><table class="needs"><colgroup><col class="c-sq"><col class="c-et"><col class="c-ld"></colgroup><thead><tr><th>Squad / Sistema</th><th>Necessidades</th><th>Agile Coach</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---------------- modais ----------------
function modal(title, body, foot, cls = '') {
  const el = document.createElement('div'); el.className = 'overlay';
  el.innerHTML = `<div class="modal ${cls}"><header><h2>${title}</h2><button class="x" data-act="close" aria-label="Fechar">×</button></header><div class="body">${body}</div>${foot ? `<footer>${foot}</footer>` : ''}</div>`;
  el.addEventListener('mousedown', e => { if (e.target === el) el.remove(); });
  $('#modals').appendChild(el); return el;
}
const closeModals = () => { $('#modals').innerHTML = ''; };
const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
const peopleOpts = (list, cur, blank) => opt('', blank, cur || '') + DB[list].map(p => opt(p.id, p.nome, cur)).join('');

function timelineHtml(evs) {
  if (!evs.length) return '<div class="empty">Sem registros.</div>';
  return `<div class="timeline">${evs.sort((a, b) => b.data.localeCompare(a.data)).map(e => `<div class="ev ${e.cls || ''}"><div class="d"><b>${fmt(e.data)}</b>${e.tag ? '<span> · ' + e.tag + '</span>' : ''}</div>${e.html}</div>`).join('')}</div>`;
}
function needHistory(n) {
  return n.historico.map(h => ({ data: h.data, cls: h.para === 'Concluída' ? 'ok' : '', tag: h.tipo === 'criacao' ? 'Criação' : h.tipo === 'edicao' ? 'Edição' : 'Status',
    html: h.tipo === 'status' ? `${badge(h.de)} → ${badge(h.para)}${h.nota ? '<div class="muted small">' + esc(h.nota) + '</div>' : ''}` : esc(h.nota || (h.para ? 'Criada com status ' + h.para : 'Registro criado')) }));
}
function openNeed(id) {
  const n = G(DB.needs, id), s = sqOf(n.squadId);
  const el = modal(esc(n.nome) + ' ' + badge(n.status), `
  ${!n.validado ? `<div class="note warn">Registro importado da planilha (célula ${esc(n.origemCelula || '')}, marcação "${esc(n.marcaPlanilha || '')}"). O status não pôde ser determinado com segurança. Defina o status real para validar.</div>` : ''}
  <dl class="kv" style="margin-bottom:14px"><dt>Squad</dt><dd>${esc(sqName(s))} — ${esc(s.sistema || 'sistema não informado')}</dd><dt>Time</dt><dd>${esc(timeName(s.timeId))}</dd>
  <dt>Categoria / ação</dt><dd>${esc((G(DB.acoes, n.acaoId) || {}).nome || '—')}</dd><dt>Nível de maturidade</dt><dd>${esc(nivLabel(n.nivel))}</dd>
  ${pName('lts', eff(n, 'ltId')) ? `<dt>Líder técnico</dt><dd>${esc(pName('lts', eff(n, 'ltId')))}</dd>` : ''}<dt>Célula de Produto</dt><dd>${esc(cpLabel(s.cpClasse) || '—')}</dd><dt>Agile Coach</dt><dd>${esc(pName('coaches', eff(n, 'coachId')) || '—')}</dd>
  <dt>Início</dt><dd>${fmt(n.dataInicio)}</dd><dt>Prevista</dt><dd>${fmt(n.dataPrevista)}</dd><dt>Conclusão efetiva</dt><dd>${fmt(n.dataConclusao)}</dd>
  ${n.dataPlanilha ? `<dt>Data na planilha</dt><dd>${mesAno(n) || fmt(n.dataPlanilha)} <span class="muted small">(coluna Obs: mês/ano)</span></dd>` : ''}
  ${n.azureId ? `<dt>Item de trabalho</dt><dd>#${esc(n.azureId)} · ${esc(n.tipo || '')} · estado de origem: ${esc(n.estadoOrigem || '—')}</dd><dt>Responsável (Assigned To)</dt><dd>${esc(n.responsavel || 'Sem responsável')}</dd><dt>Tags</dt><dd>${esc(n.tags || '—')}</dd>` : ''}<dt>Descrição</dt><dd>${esc(n.desc || '—')}</dd><dt>Observações</dt><dd>${esc(n.obs || '—')}</dd></dl>
  <h3 style="margin:6px 0 10px;font-size:14px">Histórico de acompanhamento</h3>${timelineHtml(needHistory(n))}`,
  `<button class="btn ghost" data-act="chStatus" data-id="${n.id}">Alterar status</button><button class="btn" data-act="editNeed" data-id="${n.id}">Editar</button>`);
}
function needForm(id, presetSquad) {
  const n = id ? G(DB.needs, id) : { squadId: presetSquad || F.squad || '', status: 'Não iniciada', historico: [] };
  const sq0 = sqOf(n.squadId);
  const inh = (k, l) => `(da squad: ${pName(l, sq0 && sq0[k]) || 'não definido'})`;
  const el = modal(id ? 'Editar necessidade' : 'Nova necessidade', `<form class="form" id="nf">
  <label>Squad *<select name="squadId" required><option value="">Selecione…</option>${sortBy(DB.squads, s => s.codigo + s.timeId).map(s => opt(s.id, sqName(s) + ' · ' + timeName(s.timeId) + (s.sistema ? ' · ' + s.sistema.slice(0, 30) : ''), n.squadId)).join('')}</select></label>
  <label>Time<input value="${esc(sq0 ? timeName(sq0.timeId) : '')}" disabled placeholder="definido pela squad"></label>
  <label class="full">Nome da necessidade *<input name="nome" required value="${esc(n.nome || '')}"></label>
  <label>Categoria / ação de melhoria<select name="acaoId">${opt('', '— outra / sem categoria —', n.acaoId || '')}${DB.acoes.map(a => opt(a.id, a.nome, n.acaoId)).join('')}</select></label>
  <label>Nível de maturidade relacionado<select name="nivel">${opt('', 'Não definido', n.nivel || '')}${DB.niveis.map(l => opt(l.id, nivLabel(l.id), n.nivel)).join('')}</select></label>
  <label class="full">Descrição<textarea name="desc">${esc(n.desc || '')}</textarea></label>
  <label>Data de início<input type="date" name="dataInicio" value="${esc(n.dataInicio || '')}"></label>
  <label>Data prevista para conclusão<input type="date" name="dataPrevista" value="${esc(n.dataPrevista || '')}"></label>
  ${n.dataPlanilha ? `<div class="full small muted">Data na planilha: ${mesAno(n) || fmt(n.dataPlanilha)}. <a href="#" data-act="usePlan" data-d="${n.dataPlanilha}">Usar como data prevista</a></div>` : ''}
  <label>Status<select name="status">${id && !n.status ? opt('', PV + ' (escolha para validar)', '') : ''}${STATUS.map(s => opt(s, s, n.status)).join('')}</select></label>
  <label>Data efetiva de conclusão<input type="date" name="dataConclusao" value="${esc(n.dataConclusao || '')}"></label>
  <label>Líder técnico<select name="ltId">${peopleOpts('lts', n.ltId, inh('ltId', 'lts'))}</select></label>
  <label>Agile Coach responsável<select name="coachId">${peopleOpts('coaches', n.coachId, inh('coachId', 'coaches'))}</select></label>
  <label class="full">Observações<textarea name="obs">${esc(n.obs || '')}</textarea></label>
  <div class="err" id="nferr"></div></form>
  <div class="small muted" style="margin-top:8px">Não encontrou a squad? <a href="#" data-act="newSquad">Cadastrar nova squad</a>. Responsáveis em branco herdam os da squad.</div>`,
  `<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="saveNeed" data-id="${id || ''}">Salvar</button>`);
  $('select[name=squadId]', el).addEventListener('change', e => { /* reflete time */ const s = sqOf(e.target.value); $('input[disabled]', el).value = s ? timeName(s.timeId) : ''; });
}
function saveNeed(id) {
  const f = $('#nf'), fd = Object.fromEntries(new FormData(f)), err = m => { $('#nferr').textContent = m; return false; };
  if (!fd.squadId) return err('Selecione a squad: toda necessidade deve estar vinculada a uma squad cadastrada.');
  if (!fd.nome.trim()) return err('Informe o nome da necessidade.');
  if (fd.dataInicio && fd.dataPrevista && fd.dataPrevista < fd.dataInicio) return err('A data prevista não pode ser anterior à data de início.');
  if (fd.dataConclusao && fd.status !== 'Concluída') return err('Data de conclusão só se aplica ao status "Concluída".');
  const nul = v => v || null;
  if (!id) {
    const st = fd.status || 'Não iniciada', concl = st === 'Concluída' ? (fd.dataConclusao || TODAY) : null;
    if (concl && concl > TODAY) return err('A data efetiva de conclusão não pode ser futura.');
    DB.needs.push({ id: uid('n'), squadId: fd.squadId, nome: fd.nome.trim(), desc: fd.desc, acaoId: nul(fd.acaoId), nivel: nul(fd.nivel), dataInicio: nul(fd.dataInicio), dataPrevista: nul(fd.dataPrevista), dataConclusao: concl, status: st, validado: true, ltId: nul(fd.ltId), coachId: nul(fd.coachId), obs: fd.obs, dataPlanilha: null,
      historico: [{ data: concl || TODAY, tipo: 'criacao', de: null, para: st, nota: 'Necessidade cadastrada no sistema com status ' + st + '.' }] });
  } else {
    const n = G(DB.needs, id), chg = [];
    ['nome', 'desc', 'obs'].forEach(k => { if (n[k] !== fd[k]) chg.push(k); n[k] = fd[k]; });
    ['acaoId', 'nivel', 'dataInicio', 'dataPrevista', 'ltId', 'coachId', 'squadId'].forEach(k => { const v = nul(fd[k]); if ((n[k] || null) !== v) chg.push(k); n[k] = v; });
    if (fd.status && fd.status !== n.status) { const e = setStatus(n, fd.status, fd.status === 'Concluída' ? (fd.dataConclusao || TODAY) : TODAY, 'Alterado na edição'); if (e) return err(e); }
    else if (n.status === 'Concluída' && fd.dataConclusao && fd.dataConclusao !== n.dataConclusao) { if (fd.dataConclusao > TODAY) return err('A data efetiva não pode ser futura.'); n.dataConclusao = fd.dataConclusao; chg.push('dataConclusao'); }
    if (chg.length) n.historico.push({ data: TODAY, tipo: 'edicao', nota: 'Campos alterados: ' + chg.join(', ') + '.' });
    save();
  }
  save(); closeModals(); render(); toast('Necessidade salva.'); return true;
}
function askStatus(id, para) {
  const n = G(DB.needs, id);
  const el = modal('Alterar status', `<form class="form" id="sf"><label class="full">Status<select name="para">${STATUS.filter(s => s !== n.status).map(s => opt(s, s, para)).join('')}</select></label>
  <label class="full" id="dl"><span id="dll">Data da mudança</span><input type="date" name="data" value="${TODAY}" max="${TODAY}"></label>
  <label class="full">Observação (opcional)<textarea name="nota"></textarea></label><div class="err" id="sferr"></div></form>
  <div class="small muted">Atual: ${badge(n.status)}${n.status === 'Concluída' ? '<br>Ao sair de "Concluída", a data efetiva de conclusão é removida e o histórico é mantido.' : ''}</div>`,
  `<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="okStatus" data-id="${id}">Confirmar</button>`, 'narrow');
  const sync = () => { $('#dll', el).textContent = $('select[name=para]', el).value === 'Concluída' ? 'Data efetiva de conclusão' : 'Data da mudança'; };
  $('select[name=para]', el).addEventListener('change', sync); sync();
}

// ---------------- Maturidade ----------------
// Ícones dos estágios (outline, cor herdada do card): olho fechado, foguete, equipe, engrenagem com seta, alvo.
const IC_SVG = p => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
const IC_LV = {
  N0: IC_SVG('<path d="M3 10c2.3 3 5.4 4.5 9 4.5s6.7-1.5 9-4.5"/><path d="M5.6 13.1 4 15.4M9.4 14.3 8.8 17M14.6 14.3l.6 2.7M18.4 13.1l1.6 2.3"/>'),
  T01: IC_SVG('<path d="M12 2.8c3 2 4.6 5.3 4.6 9.2v4.4H7.4V12c0-3.9 1.6-7.2 4.6-9.2z"/><circle cx="12" cy="9.6" r="1.7"/><path d="M7.4 12.6 4.6 15.4v2.4l2.8-1.4M16.6 12.6l2.8 2.8v2.4l-2.8-1.4"/><path d="M10.2 19.2 12 21.4l1.8-2.2"/>'),
  N1: IC_SVG('<circle cx="12" cy="8" r="3"/><path d="M6.5 19.5v-1a5.5 5.5 0 0111 0v1"/><circle cx="5" cy="9.5" r="2.2"/><path d="M1.8 18.5v-.6a3.7 3.7 0 014.6-3.6"/><circle cx="19" cy="9.5" r="2.2"/><path d="M22.2 18.5v-.6a3.7 3.7 0 00-4.6-3.6"/>'),
  T12: IC_SVG('<circle cx="10" cy="13" r="2.6"/><path d="M10 6.2v1.6M10 18.2v1.6M3.2 13h1.6M15.2 13h1.6M5.2 8.2l1.1 1.1M13.7 16.7l1.1 1.1M5.2 17.8l1.1-1.1M13.7 9.3l1.1-1.1"/><circle cx="10" cy="13" r="5"/><path d="M15.5 3.5h5v5M20.5 3.5l-5.2 5.2"/>'),
  N2: IC_SVG('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'),
};
function vMat() {
  const { squads, needs } = getFiltered();
  const semAv = squads.filter(s => !s.nivel).length;
  const LVC = { N0: ['#4B5563', '#374151'], T01: ['#2563EB', '#1D4ED8'], N1: ['#059669', '#047857'], T12: ['#F68B1F', '#B45309'], N2: ['#A6193C', '#A6193C'] };
  const legend = `<div class="panel" style="margin-bottom:14px"><h3>Níveis de Maturidade</h3><div class="hint">Visualize os níveis de maturidade organizacional, suas características e a distribuição das squads em cada etapa.</div>
  ${semAv ? `<span class="badge b-n lvbadge" title="Squads ainda sem nível avaliado não entram em nenhuma etapa abaixo">${semAv} squad${semAv > 1 ? 's' : ''} sem avaliação</span>` : ''}
  <ol class="lvgrid" aria-label="Níveis de Maturidade">${DB.niveis.map(l => { const nc = DB.criterios.filter(c => c.estagio === l.id).length, ns = squads.filter(s => s.nivel === l.id).length, [bar, tc] = LVC[l.id] || ['#999', '#333']; return `<li class="lv" tabindex="0" aria-describedby="tip-${l.id}" style="--c:${bar};--tc:${tc}"><span class="inf" aria-hidden="true">i</span><span class="lvic" aria-hidden="true">${IC_LV[l.id] || ''}</span><b>${esc(nivLabel(l.id))}</b><div class="cnt"><span>${nc} critério${nc === 1 ? '' : 's'}</span><span class="${ns ? 'has' : 'zero'}">${ns} squad(s)</span></div><span class="tip" role="tooltip" id="tip-${l.id}">${esc(l.descricao)}</span></li>`; }).join('')}</ol></div>`;
  if (!squads.length) return filterBar({ geral: true }) + legend + '<div class="empty">Nenhuma squad para os filtros atuais.</div>';
  return filterBar({ geral: true }) + legend + `<div class="grid sq-grid">${sortBy(squads, s => s.codigo + s.timeId).map(s => {
    const ns = needs.filter(n => n.squadId === s.id), x = stats(ns), lu = lastUpdate(s), rank = nivRank(s.nivel);
    return `<div class="card sqcard" data-act="openSq" tabindex="0" data-id="${s.id}" style="border-left-color:${nivCol(s.nivel)}">
    <div style="display:flex;justify-content:space-between;gap:8px"><div><h3>${esc(sqName(s))} <span class="muted small">· ${esc(timeName(s.timeId))}</span></h3><div class="small muted">${esc(s.sistema || 'Sistema/produto não informado')}</div></div>${s.cpClasse ? `<span class="chip">${esc(s.cpClasse)}</span>` : ''}</div>
    <div><div class="track">${DB.niveis.map(l => `<span style="${l.ordem <= rank ? 'background:' + nivCol(l.id) : ''}"></span>`).join('')}</div><div class="track-l" lang="pt-BR">${DB.niveis.map(l => `<span>${esc(nivLabel(l.id))}</span>`).join('')}</div><div style="margin-top:6px"><b>${esc(nivLabel(s.nivel))}</b></div></div>
    <div><div class="bar">${[...STATUS].map(k => { const c = ns.filter(n => stOf(n) === k).length; return c ? `<i style="width:${c / (x.total || 1) * 100}%;background:${ST_COL[k]}" title="${esc(k)}: ${c}"></i>` : ''; }).join('')}</div>
    <div class="small" style="margin-top:4px">${x.total ? `Conclusão das necessidades: <b>${x.pct}%</b> (${x.concl} de ${x.total}) · ${x.pend} pendentes · ${x.and} em andamento` : '<span class="muted">Nenhuma necessidade registrada</span>'}</div></div>
    <dl class="kv">${s.ltId && pName('lts', s.ltId) ? `<dt>Líder técnico</dt><dd>${esc(pName('lts', s.ltId))}</dd>` : ''}<dt>Célula de Produto</dt><dd>${esc(cpLabel(s.cpClasse) || '—')}</dd><dt>Agile Coach</dt><dd>${esc(pName('coaches', s.coachId) || '—')}</dd><dt>Início acomp.</dt><dd>${fmt(s.inicio)}</dd><dt>Última atualização</dt><dd>${fmt(lu)}</dd></dl></div>`; }).join('')}</div>
  <div class="legend" style="margin-top:12px">${[...STATUS].map(k => `<span><i style="background:${ST_COL[k]}"></i>${esc(k)}</span>`).join('')}</div>`;
}
const IC_LAYERS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>', IC_SWAP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4-4 4"/><path d="M21 7H8"/><path d="M7 21l-4-4 4-4"/><path d="M3 17h13"/></svg>', IC_CLOCK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>';
const IC_PEND = '<svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="20" height="18" rx="3"/><path d="M3 12h20M8.5 3.5v5M17.5 3.5v5"/><circle cx="22.5" cy="22.5" r="6.5" fill="#FFF3E6"/><path d="M22.5 19.2v3.5l2.4 1.5"/><circle cx="27.5" cy="4.5" r="2.6" fill="currentColor" stroke="none"/></svg>';
// "Resolver pendências" leva à etapa certa: cadastro (Célula/Agile Coach) → início do acompanhamento → avaliação de maturidade
function resolverPend(id, e) {
  const s = sqOf(id); if (!s) return;
  if (!s.cpClasse || !s.coachId) { closeModals(); return squadForm(id); }
  if (!s.inicio) return ACT.setInicio({ id }, e);
  if (!s.nivel) { closeModals(); return openAval(id); }
}
function openSquad(id) {
  const s = sqOf(id), ns = needsOf(id), x = stats(ns), crit = DB.criterios, av = avalOf(id), ans = av ? av.respostas || {} : {}, res = classify(ans), marks = new Set(DB.marcacoes.filter(m => m.squadId === id).map(m => m.criterioId));
  const evs = [
    ...s.historico.map(h => ({ data: h.data, tag: 'Cadastro', html: esc(h.campo === 'cadastro' ? h.nota : h.campo + ': ' + (h.de || '—') + ' → ' + (h.para || '—')) })),
    ...DB.nivelHist.filter(h => h.squadId === id).map(h => ({ data: h.data, cls: 'lvl', tag: h.avaliacaoId ? 'Maturidade · avaliação' : 'Maturidade', html: `${esc(nivLabel(h.de))} → <b>${esc(nivLabel(h.para))}</b>${h.nota ? '<div class="muted small">' + esc(h.nota) + '</div>' : ''}` })),
    ...ns.flatMap(n => n.historico.filter(h => h.tipo === 'status').map(h => ({ data: h.data, cls: h.para === 'Concluída' ? 'ok' : '', tag: 'Necessidade', html: `${esc(n.nome)}: ${badge(h.de)} → ${badge(h.para)}` }))),
  ];
  const missing = []; if (!s.cpClasse) missing.push('Célula de Produto'); if (!s.coachId) missing.push('Agile Coach'); if (!s.nivel) missing.push('nível de maturidade'); if (!s.inicio) missing.push('início do acompanhamento');
  modal(esc(sqName(s)) + ' <span class="muted small">· ' + esc(timeName(s.timeId)) + '</span>', `
  <div class="small muted" style="margin-bottom:10px">${esc(s.sistema || 'Sistema/produto não informado')}</div>
  ${missing.length ? `<div class="pendalert" role="status" title="Pendente: ${esc(missing.join(', '))}"><span class="pendic" aria-hidden="true">${IC_PEND}</span><span class="pendtx">Informações pendentes<span class="sr-only">: ${esc(missing.join(', '))}</span></span><button type="button" class="pendbtn" data-act="resolverPend" data-id="${id}">Resolver pendências</button></div>` : ''}
  <section class="sqsec"><h3 class="sqsh">Necessidades</h3>
  ${x.total ? `<div class="necbox"><div class="bar necbarra">${[...STATUS].map(k => { const c = ns.filter(n => stOf(n) === k).length; return c ? `<i style="width:${c / x.total * 100}%;background:${ST_COL[k]}"></i>` : ''; }).join('')}</div><div class="necsum"><b>${x.pct}%</b> concluídas (${x.concl} de ${x.total}) · ${x.pend} pendentes (${x.pv} a validar) · ${x.and} em andamento · ${x.su} suspensas</div></div>` : '<div class="small muted">Sem necessidades registradas.</div>'}
  <dl class="kv kvgrid">${s.ltId && pName('lts', s.ltId) ? `<dt>Líder técnico</dt><dd>${esc(pName('lts', s.ltId))}</dd>` : ''}<dt>Célula de Produto</dt><dd>${esc(cpLabel(s.cpClasse) || '—')}</dd><dt>Agile Coach</dt><dd>${esc(pName('coaches', s.coachId) || '—')}</dd><dt>Início do acompanhamento</dt><dd>${s.inicio ? `${fmt(s.inicio)} <a href="#" class="small" data-act="setInicio" data-id="${id}">editar</a>` : `<span class="muted">Não informado</span> <a href="#" class="small" data-act="setInicio" data-id="${id}">Definir data</a>`}</dd>
  ${s.datasPlanilha ? `<dt>Datas na planilha</dt><dd class="small">início ${fmt(s.datasPlanilha.inicio)} · previsão ${fmt(s.datasPlanilha.previsao)} <span class="muted">(a validar)</span></dd>` : ''}</dl></section>
  <section class="sqsec"><h3 class="sqsh">Nível de maturidade atual</h3>
  <div class="lvcur"><div class="lvbox" style="border-left:4px solid ${nivCol(s.nivel)}"><b>${esc(nivLabel(s.nivel))}</b><div class="small muted">${av ? 'Última avaliação: ' + fmt(av.data) + ((av.origem || []).length ? ' · origem: ' + av.origem.map(o => o === 'app' ? 'aplicação' : 'planilha').join(' + ') : '') : 'Ainda não avaliada'}</div></div><button class="btn" data-act="avaliar" data-id="${id}">Avaliar maturidade</button></div>
  ${av && av.obs ? `<div class="small" style="margin-top:6px"><span class="muted">Observação da avaliação:</span> ${esc(av.obs)}</div>` : ''}</section>
  <h3 style="margin:16px 0 6px;font-size:14px">Critérios do modelo de maturidade</h3>
  ${res.stages.map(st => { const cs = crit.filter(c => c.estagio === st.id), nv = niv(st.id), cons = nv && nv.fase === 'Consolidação'; return `<details class="stc"><summary><span class="stic ${cons ? 'cons' : 'trans'}" aria-hidden="true">${cons ? IC_LAYERS : IC_SWAP}</span><span class="stt"><b>${esc(nv ? nivLabel(st.id) : st.id)}</b><em class="stchip ${cons ? 'cons' : 'trans'}">${cons ? 'consolidação' : 'evolução'}</em></span><span class="stk"><span class="kk ok">✓ ${st.sim} atendido(s)</span><span class="kk no">✕ ${st.nao} não atendido(s)</span><span class="kk pe">◷ ${st.pend} pendente(s)</span></span><span class="chev" aria-hidden="true"></span></summary><div class="small" style="padding:6px 0 6px 8px">${cs.map(c => { const a = ans[c.id]; return `<div class="crrow"><span class="crans ${a || 'pend'}">${a === 'sim' ? '✔ Sim' : a === 'nao' ? '✖ Não' : '— Não avaliado'}</span><span>${c.codigo ? '<b>' + esc(c.codigo) + '</b> ' : ''}${esc(c.texto)} <span class="muted">· ${esc(c.categoria || '')}</span></span>${marks.has(c.id) ? '<span class="muted small" title="' + esc('Marcado com "x" na planilha de maturidade e sincronizado como atendido.' + ((DB.marcacoes.find(m => m.squadId === id && m.criterioId === c.id) || {}).obs ? ' Obs.: ' + DB.marcacoes.find(m => m.squadId === id && m.criterioId === c.id).obs : '')) + '">x na planilha</span>' : ''}</div>`; }).join('')}</div></details>`; }).join('')}
  <section class="sqhist"><h3 class="sqhh"><span class="sqhi" aria-hidden="true">${IC_CLOCK}</span>Histórico de evolução</h3>${timelineHtml(evs)}</section>`,
  `<span class="lastupd">Última atualização: ${fmt(lastUpdate(s))}</span><span class="fbtns"><button class="btn ghost" data-act="close">Fechar</button><button class="btn ghost" data-act="editSquad" data-id="${id}">Editar cadastro</button></span>`, 'sqmodal');
}

// ---------------- Avaliação de maturidade ----------------
const TRI_L = { '': 'Não avaliado', sim: 'Sim', nao: 'Não' }, TRI_I = { '': '', sim: '✔', nao: '✖' }, TRI_NEXT = { '': 'sim', sim: 'nao', nao: '' };
function openAval(id) {
  const s = sqOf(id), av = avalOf(id), ans = av ? av.respostas || {} : {};
  const tri = c => { const v = ans[c.id] || ''; return `<input type="hidden" name="r_${c.id}" value="${v}"><button type="button" class="tri" data-act="tri" data-v="${v}" data-lab="${esc((c.codigo ? c.codigo + ' ' : '') + c.texto)}" aria-label="${esc((c.codigo ? c.codigo + ' ' : '') + c.texto)}: ${TRI_L[v]}. Pressione para alternar." title="${TRI_L[v]} (clique para alternar)"><i aria-hidden="true">${TRI_I[v]}</i></button>`; };
  const stages = DB.niveis.map(l => { const cs = DB.criterios.filter(c => c.estagio === l.id); return `<section class="avst" data-st="${l.id}"><h4 style="border-left:4px solid ${nivCol(l.id)}"><span>${esc(nivLabel(l.id))}</span><span class="small muted avc"></span></h4>${cs.map(c => `<div class="avq"><div class="avt">${c.codigo ? '<b>' + esc(c.codigo) + '</b> ' : ''}${esc(c.texto)}<div class="muted small">${esc(c.categoria || '')}</div></div><div class="avr">${tri(c)}</div></div>`).join('')}</section>`; }).join('');
  const el = modal('Avaliar maturidade — ' + esc(sqName(s)) + ' <span class="muted small">· ' + esc(timeName(s.timeId)) + '</span>', `
  <div class="note">O nível da squad é definido <b>somente pelo resultado desta avaliação</b> e só é atualizado ao salvar. Critérios "Não avaliado" nunca contam como atendidos.</div>
  <div id="avprev" class="avprev"></div>
  <form id="avf"><div class="form" style="grid-template-columns:1fr 2fr;margin-bottom:10px"><label>Data da avaliação<input type="date" name="data" value="${esc(av ? av.data : TODAY)}" max="${TODAY}"></label><label>Observação<input name="obs" value="${esc(av ? av.obs || '' : '')}"></label></div>
  ${stages}<div class="err" id="averr"></div></form>`,
  `<button class="btn ghost" data-act="cancelAval" data-id="${id}">Cancelar</button><button class="btn" data-act="saveAval" data-id="${id}">Salvar avaliação</button>`, 'avmodal');
  const f = $('#avf', el), read = () => { const fd = new FormData(f), a = {}; DB.criterios.forEach(c => { const v = fd.get('r_' + c.id); if (v) a[c.id] = v; }); return a; };
  const upd = () => { const r = classify(read()); $('#avprev', el).innerHTML = '<div><span class="muted">Nível atual da squad:</span> <b>' + esc(nivLabel(s.nivel)) + '</b></div><div><span class="muted">Nível resultante desta avaliação (prévia, ainda não salvo):</span> <b>' + esc(nivLabel(r.nivel)) + '</b></div>' + r.avisos.map(x => '<div class="small late">⚠ ' + esc(x) + '</div>').join('');
    $$('.avst', el).forEach(sec => { const st = r.stages.find(x => x.id === sec.dataset.st); $('.avc', sec).textContent = st.sim + ' atendido(s) · ' + st.nao + ' não · ' + st.pend + ' pendente(s)'; }); };
  f.addEventListener('change', upd); upd();
}
function saveAval(id) {
  const s = sqOf(id), f = $('#avf'), fd = new FormData(f), err = m => { $('#averr').textContent = m; return false; };
  const ans = {}; DB.criterios.forEach(c => { const v = fd.get('r_' + c.id); if (v) ans[c.id] = v; });
  const data = fd.get('data') || TODAY, obs = (fd.get('obs') || '').trim();
  if (!Object.keys(ans).length) return err('Responda ao menos um critério antes de salvar.');
  if (data > TODAY) return err('A data da avaliação não pode ser futura.');
  const res = classify(ans), antes = s.nivel || null;
  if (antes !== res.nivel) {
    const ult = DB.nivelHist.filter(h => h.squadId === id).map(h => h.data).sort().pop();
    if (ult && data < ult) return err('A data da avaliação não pode ser anterior à última alteração de nível registrada (' + fmt(ult) + ').');
  }
  let av = avalOf(id);
  if (!av) { av = { id: 'av-' + id, squadId: id }; DB.avaliacoes.push(av); }
  av.data = data; av.respostas = ans; av.obs = obs; av.nivelResultado = res.nivel; av.salvaEm = TODAY; av.origem = [...new Set([...(av.origem || []), 'app'])];
  if (antes !== res.nivel) { setNivel(s, res.nivel, data, obs || 'Resultado da avaliação de maturidade.', { avaliacaoId: av.id }); s.nivel = res.nivel; }
  save(); closeModals(); render(); openSquad(id); toast(antes !== res.nivel ? 'Avaliação salva. Nível atualizado: ' + nivLabel(res.nivel) + '.' : 'Avaliação salva. O nível não mudou.');
  return true;
}

// ---------------- Cadastro ----------------
function squadForm(id) {
  const s = id ? sqOf(id) : { status: 'Ativa', historico: [] };
  modal(id ? 'Editar cadastro da squad' : 'Nova squad', `<form class="form" id="qf">
  <label>Código da squad *<input name="codigo" required maxlength="6" value="${esc(s.codigo || '')}" ${id ? 'disabled' : ''}></label>
  <label>Nome da squad *<input name="nome" required value="${esc(s.nome || '')}"></label>
  <label>Time *<select name="timeId"><option value="">Selecione…</option>${DB.times.map(t => opt(t.id, timeName(t.id), s.timeId)).join('')}</select></label>
  <label>…ou novo time (código)<input name="novoTime" maxlength="6" placeholder="ex.: 061"></label>
  <label class="full">Sistema / produto<input name="sistema" value="${esc(s.sistema || '')}"></label>
  <label>Célula de Produto<select name="cpClasse">${opt('', '—', s.cpClasse || '')}${['CP I', 'CP II', 'CP III'].map(c => opt(c, cpLabel(c), s.cpClasse)).join('')}</select></label>
  <label>Agile Coach responsável<select name="coachId">${peopleOpts('coaches', s.coachId, '— não definido —')}</select></label>
  <label>Líder técnico<select name="ltId">${peopleOpts('lts', s.ltId, '— não definido —')}</select></label>
  <label>Status da squad<select name="status">${opt('', 'A validar', s.status || '')}${['Ativa', 'Inativa'].map(c => opt(c, c, s.status)).join('')}</select></label>
  <div class="full small muted">Nível de maturidade atual: <b>${esc(nivLabel(s.nivel))}</b> — definido somente pela avaliação de maturidade (detalhes da squad › Avaliar maturidade).</div>
  <label>Início do acompanhamento<input type="date" name="inicio" value="${esc(s.inicio || '')}"></label>
  <label class="full">Observações<textarea name="obs">${esc(s.obs || '')}</textarea></label><div class="err" id="qferr"></div></form>
  <div class="small muted">Alterações de Célula de Produto, responsáveis e início do acompanhamento são registradas no histórico da squad.</div>`,
  `${id ? `<button class="btn ghost" data-act="cancelAval" data-id="${id}">Cancelar</button>` : '<button class="btn ghost" data-act="close">Cancelar</button>'}<button class="btn" data-act="saveSquad" data-id="${id || ''}">Salvar</button>`);
}
function saveSquad(id) {
  const fd = Object.fromEntries(new FormData($('#qf'))), err = m => { $('#qferr').textContent = m; };
  const nul = v => v || null;
  let timeId = fd.timeId;
  if (fd.novoTime && fd.novoTime.trim()) { const c = fd.novoTime.trim().padStart(3, '0'); let t = DB.times.find(t => t.codigo === c); if (!t) { t = { id: 't' + c, codigo: c, nome: null }; DB.times.push(t); } timeId = t.id; }
  if (!timeId) return err('Informe o time da squad.');
  if (!fd.nome.trim()) return err('Informe o nome da squad.');
  let s;
  if (!id) {
    const cod = (fd.codigo || '').trim().padStart(3, '0'); if (!/^\d+$/.test(cod)) return err('Informe o código numérico da squad.');
    if (DB.squads.some(x => x.codigo === cod && x.timeId === timeId)) return err('Já existe a squad ' + cod + ' neste time.');
    s = { id: cod + '-' + G(DB.times, timeId).codigo, codigo: cod, nivel: null, origem: ['manual'], datasPlanilha: null, historico: [{ data: TODAY, campo: 'cadastro', nota: 'Squad cadastrada no sistema.' }] };
    DB.squads.push(s);
  } else s = sqOf(id);
  const L = { coachId: ['Agile Coach', 'coaches'], ltId: ['Líder técnico', 'lts'], timeId: ['Time', null] };
  Object.entries(L).forEach(([k, [lab, list]]) => { const novo = k === 'timeId' ? timeId : nul(fd[k]); if (id && (s[k] || null) !== novo) s.historico.push({ data: TODAY, campo: lab, de: list ? pName(list, s[k]) : timeName(s[k]), para: list ? pName(list, novo) : timeName(novo) }); s[k] = novo; });
  if (id && (s.cpClasse || null) !== nul(fd.cpClasse)) s.historico.push({ data: TODAY, campo: 'Célula de Produto', de: cpLabel(s.cpClasse) || null, para: cpLabel(nul(fd.cpClasse)) || null });
  if (id && (s.inicio || null) !== nul(fd.inicio)) s.historico.push({ data: TODAY, campo: 'Início do acompanhamento', de: s.inicio ? fmt(s.inicio) : null, para: nul(fd.inicio) ? fmt(fd.inicio) : null });
  s.nome = fd.nome.trim(); s.sistema = nul(fd.sistema); s.cpClasse = nul(fd.cpClasse); s.status = nul(fd.status); s.inicio = nul(fd.inicio); s.obs = fd.obs;
  save(); closeModals(); render(); if (id) openSquad(id); toast('Squad salva.');
}
function vCad() {
  const tabs = [['squads', 'Squads'], ['pessoas', 'Pessoas'], ['qual', 'Qualidade dos dados'], ['dados', 'Dados e importação']];
  const head = `<div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.cad === k ? 'on' : ''}" data-act="cadTab" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (ui.cad === 'squads') {
    return head + `<div class="tbl-wrap"><table class="sqs"><colgroup><col style="width:28%"><col style="width:9%"><col style="width:9%"><col style="width:22%"><col style="width:22%"><col style="width:100px"></colgroup><thead><tr><th>Squad / Sistema</th><th>Time</th><th>Célula de Produto</th><th>Agile Coach</th><th>Outras informações</th><th><span class="sr">Ações</span></th></tr></thead><tbody>
    ${sortBy(DB.squads, s => s.codigo + s.timeId).map(s => { const tm = G(DB.times, s.timeId) || {}; return `<tr><td><div class="sqc"><span class="vb" aria-hidden="true"></span><div><b>${esc(sqName(s))}</b><div class="sub">${esc(s.sistema || 'Sistema não informado')}</div></div></div></td>
    <td><span class="timechip" title="${esc(tm.nome || '')}">Time<br>${esc(tm.codigo || '—')}</span></td>
    <td>${s.cpClasse ? `<span class="chip" title="Célula de Produto">${esc(cpLabel(s.cpClasse))}</span>` : '<span class="nodoc">— A definir</span>'}</td>
    <td>${lead('co', 'COACH', pName('coaches', s.coachId))}</td>
    <td class="small"><div><span class="muted">Nível:</span> ${esc(nivShort(s.nivel))}</div><div><span class="muted">Início do acompanhamento:</span> ${fmt(s.inicio)}</div><div><span class="muted">Status:</span> ${esc(s.status || 'A validar')}</div></td>
    <td><button class="btn ghost sm" data-act="editSquad" data-id="${s.id}" aria-label="Editar ${esc(sqName(s))}">Editar</button></td></tr>`; }).join('')}</tbody></table></div>`;
  }
  if (ui.cad === 'pessoas') {
    const blk = (list, title, hint) => `<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${title}</h3><button class="btn sm" data-act="addPerson" data-l="${list}">Adicionar</button></div><div class="hint">${hint}</div><div class="list">${DB[list].length ? DB[list].map(p => `<div class="it2"><span>${esc(p.nome)} <span class="muted small">${esc(p.matricula || '')}</span></span><span>${DB.squads.filter(s => s[list === 'coaches' ? 'coachId' : 'ltId'] === p.id).length} squad(s) <button class="btn ghost sm" data-act="editPerson" data-l="${list}" data-id="${p.id}">Editar</button></span></div>`).join('') : '<div class="empty">Nenhum cadastrado.</div>'}</div></div>`;
    return head + `<div class="grid two">${blk('coaches', 'Agile Coach', 'Responsáveis pelas squads no cadastro organizacional. Célula de Produto não é pessoa: é a classificação (Célula de Produto I, II ou III) definida na própria squad.')}${blk('lts', 'Líder técnico', '')}</div>`;
  }
  if (ui.cad === 'qual') return head + qualidade();
  return head + `<div class="grid two"><div class="panel"><h3>Backup e migração</h3><div class="hint">Os dados ficam no navegador. Exporte para guardar ou levar a outro computador.</div><div class="actions"><button class="btn" data-act="expJson">Exportar JSON</button><button class="btn ghost" data-act="expCsv">Exportar necessidades (CSV)</button><label class="btn ghost" style="cursor:pointer">Importar JSON<input type="file" accept=".json" data-imp hidden></label></div></div>
  <div class="panel"><h3>Restaurar importação original</h3><div class="hint">Descarta tudo o que foi alterado e recarrega os dados da planilha e do print.</div><button class="btn danger" data-act="reset">Restaurar dados originais</button></div></div>`;
}
function qualidade() {
  const sq = DB.squads, needs = DB.needs, imp = DB.importacao || { avisos: [] };
  const gaps = sq.map(s => ({ s, falta: [['cpClasse', 'Célula de Produto'], ['coachId', 'Agile Coach'], ['nivel', 'nível'], ['inicio', 'início do acompanhamento'], ['status', 'status da squad'], ['sistema', 'sistema/produto']].filter(([k]) => !s[k]).map(x => x[1]) })).filter(x => x.falta.length);
  const pv = needs.filter(n => !n.status).length, semData = needs.filter(n => !n.dataInicio && !n.dataPrevista).length;
  return `<div class="grid cards"><div class="card"><div class="lbl">Squads no cadastro</div><div class="val">${sq.length}</div><div class="sub">${sq.filter(s => s.origem.includes('print')).length} do print · ${sq.filter(s => s.origem.includes('planilha')).length} na planilha</div></div>
  <div class="card warn"><div class="lbl">Squads incompletas</div><div class="val">${gaps.length}</div></div><div class="card warn"><div class="lbl">Necessidades pendentes de validação</div><div class="val">${pv}</div><div class="sub">de ${needs.length}</div></div><div class="card mut"><div class="lbl">Necessidades sem início/prevista</div><div class="val">${semData}</div></div></div>
  <div class="panel" style="margin-bottom:14px"><h3>Relatório da importação</h3><div class="hint">${esc(imp.arquivo || '')}</div><ul class="small" style="margin:0;padding-left:18px">${imp.avisos.map(a => `<li>${esc(a)}</li>`).join('')}<li>Marcações "x" da planilha foram importadas como <b>pendentes de validação</b>; nenhuma foi tratada como conclusão. A data da coluna Obs foi guardada como "data na planilha", sem virar prazo.</li><li>Linhas "Data de Início" e "Data de Previsão de Conclusão" foram tratadas como datas da squad (a validar), não como necessidades.</li><li>Linhas "Review" e "Wip" não têm marcação em nenhuma squad; permanecem no catálogo de ações, sem registros.</li><li>Squads S137, S094, S074 (Times 17 e 57) têm líder técnico na planilha, mas nenhuma marcação; ficam sem necessidades até serem cadastradas.</li></ul></div>
  <div class="panel"><h3>Squads com informações a complementar</h3><div class="list" style="margin-top:8px">${gaps.map(g => `<div class="it2 a"><span><b>${esc(sqName(g.s))}</b> · ${esc(timeName(g.s.timeId))} <span class="muted small">falta: ${g.falta.join(', ')}</span></span><button class="btn ghost sm" data-act="editSquad" data-id="${g.s.id}">Complementar</button></div>`).join('') || '<div class="empty">Cadastro completo.</div>'}</div></div>`;
}
function personForm(list, id) {
  const p = id ? G(DB[list], id) : {}, T = { coaches: 'Agile Coach', lts: 'líder técnico' }[list];
  modal((id ? 'Editar ' : 'Adicionar ') + T, `<form class="form" id="pf" style="grid-template-columns:1fr"><label>Nome completo *<input name="nome" required value="${esc(p.nome || '')}"></label><label>Matrícula<input name="matricula" value="${esc(p.matricula || '')}"></label><div class="err" id="pferr"></div></form>`,
    `<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="savePerson" data-l="${list}" data-id="${id || ''}">Salvar</button>`, 'narrow');
}

// ---------------- Métricas por período ----------------
function periodMetrics(code, squads) {
  const p = periodOf(code), ids = new Set(squads.map(s => s.id));
  const dist = {}; squads.forEach(s => { const l = nivelEm(s.id, p.fim); const k = l === undefined || l === null ? 'nd' : l; dist[k] = (dist[k] || 0) + 1; });
  const ns = DB.needs.filter(n => ids.has(n.squadId)), at = ns.map(n => ({ n, st: statusEm(n, p.fim) })).filter(x => x.st !== undefined);
  const concl = ns.filter(n => n.dataConclusao && n.dataConclusao >= p.ini && n.dataConclusao <= p.fim && statusEm(n, p.fim) === 'Concluída').length;
  const c = f => at.filter(x => f(x.st)).length;
  return { p, dist, concl, total: at.length, done: c(s => s === 'Concluída'), pend: c(s => !s || s === 'Não iniciada'), and: c(s => ['Em andamento', 'Em consolidação', 'Em transição'].includes(s)), evolved: squads.filter(s => DB.nivelHist.some(h => h.squadId === s.id && h.de && nivRank(h.para) > nivRank(h.de) && h.data >= p.ini && h.data <= p.fim)).length };
}

// ---------------- render ----------------
function render() {
  const v = VIEWS[ui.view];
  if (ui.view !== 'needs') delete F.need;
  else { ['time', 'nivel', 'status', 'de', 'ate', 'sem', 'ano'].forEach(k => { delete F[k]; }); if (F.coach === '__nd') delete F.coach; } // Necessidades: só Squad, Categoria, Necessidade e Agile Coach
  delete F.lt; // o filtro de liderança é somente Agile Coach; o líder técnico segue na base
  $('#nav').innerHTML = [...['geral', 'mat', 'needs'].map(k => [k, VIEWS[k]]), ...Object.entries(VIEWS).filter(([k]) => !['geral', 'mat', 'needs', 'cad'].includes(k))].map(([k, x]) => `<button class="${ui.view === k ? 'on' : ''}" data-act="nav" data-v="${k}" title="${x.t}" aria-label="${x.t}"><svg viewBox="0 0 24 24"><path d="${x.icon}"/></svg>${x.t}</button>`).join('');
  $('#ttl').textContent = v.t; $('#dsc').textContent = v.d; document.title = v.t + ' · Maturidade ASI';
  $('#acts').innerHTML = ui.view === 'needs' ? '<button class="btn ghost" data-act="azImport">Importar necessidade</button>' : ui.view === 'mat' ? '<button class="btn ghost" data-act="matImport">Importar planilha de maturidade</button>' : ui.view === 'cad' ? '<button class="btn cta" data-act="newSquad">+ Nova squad</button>' : '';
  const q = document.activeElement && document.activeElement.hasAttribute('data-q'), pos = q ? document.activeElement.selectionStart : 0;
  $('#view').innerHTML = { geral: () => filterBar({ geral: true }) + vGeral(), needs: vNeeds, mat: vMat, cad: vCad }[ui.view]();
  if (q) { const i = $('[data-q]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
}

// ---------------- eventos ----------------
const goNeeds = (f = {}) => { F = f; ui.view = 'needs'; render(); };
const csv = rows => '﻿' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
// ---------------- importação de necessidades do Azure DevOps (arquivo CSV/XLSX exportado da query) ----------------
const AZ_COLS = { id: ['id', 'work item id', 'id do item de trabalho'], tipo: ['work item type', 'tipo de item de trabalho', 'tipo'], titulo: ['title', 'titulo'], resp: ['assigned to', 'atribuido a', 'responsavel'], estado: ['state', 'estado'], tags: ['tags'], squad: ['squad'], fim: ['closed date', 'data de fechamento', 'state change date', 'data de alteracao de estado', 'resolved date'] };
const azNorm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const AZ_ST = { fechado: 'Concluída', concluido: 'Concluída', done: 'Concluída', closed: 'Concluída', 'em implementacao': 'Em andamento', fazendo: 'Em andamento', 'em andamento': 'Em andamento', doing: 'Em andamento', 'em analise': 'Em andamento', active: 'Em andamento', ativo: 'Em andamento', validacao: 'Em consolidação', resolved: 'Em consolidação', resolvido: 'Em consolidação', priorizado: 'Não iniciada', 'a fazer': 'Não iniciada', 'to do': 'Não iniciada', new: 'Não iniciada', novo: 'Não iniciada' };
let azPlan = null, azXlsxP = null;
function azParseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '', cnt = c => first.split(c).length - 1;
  const dl = cnt('\t') > Math.max(cnt(';'), cnt(',')) ? '\t' : cnt(';') > cnt(',') ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === dl) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function azLoadXlsx() {
  if (window.XLSX) return Promise.resolve();
  if (!azXlsxP) azXlsxP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => { azXlsxP = null; no(new Error('xlsx')); }; document.head.appendChild(s); });
  return azXlsxP;
}
function azReadFile(file) {
  if (/\.xlsx?$/i.test(file.name)) return azLoadXlsx().then(() => file.arrayBuffer()).then(buf => { const wb = XLSX.read(buf, { type: 'array' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }); });
  return file.text().then(azParseCsv);
}
function azDate(v) {
  v = String(v || '').trim(); if (!v) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
  return null;
}
// squad: coluna Squad > "Squad N" no título > tag Squad_N > código S### de squad cadastrada > código de sistema cadastrado
function azSquad(title, tags, col) {
  const pad = n => String(n).padStart(3, '0'), find = c => DB.squads.find(s => s.codigo === c);
  let nums = [];
  if (col) nums = (String(col).match(/\d{2,3}/g) || []).map(pad);
  if (!nums.length) { const ms = [...title.matchAll(/\b(?:squads?|sq)\.?\s*((?:\d{2,3}(?:\s*(?:,|e|\/|&)\s*)?)+)/gi)]; nums = [...new Set(ms.flatMap(m => m[1].match(/\d{2,3}/g)).map(pad))]; }
  if (!nums.length) nums = [...new Set([...String(tags).matchAll(/Squad[_\s-]?(\d{2,3})/gi)].map(m => pad(m[1])))];
  if (!nums.length) nums = [...new Set([...title.matchAll(/\bS(\d{3})\b/g)].map(m => m[1]).filter(find))];
  if (!nums.length) for (const m of title.matchAll(/\bS(\d{3})\b/g)) { const sq = DB.squads.find(s => s.sistema && s.sistema.includes('S' + m[1])); if (sq) { nums = [sq.codigo]; break; } }
  const sq = nums.length ? find(nums[0]) : null;
  return { nums, sq };
}
function azBuild(rows) {
  let hi = rows.findIndex((r, i) => i < 8 && r.some(c => AZ_COLS.id.includes(azNorm(c))) && r.some(c => AZ_COLS.titulo.includes(azNorm(c))));
  if (hi < 0) return { erro: 'Não encontrei as colunas ID e Title (Título) no arquivo. Confira se o arquivo é o resultado da query do Azure DevOps.' };
  const head = rows[hi].map(azNorm), col = {};
  for (const [k, al] of Object.entries(AZ_COLS)) { const i = head.findIndex(h => al.includes(h)); if (i >= 0) col[k] = i; }
  const byId = new Map(), P = { novos: [], atualiza: [], iguais: 0, dupArq: 0, ignoradas: 0, semSquad: 0, estadosDesc: {}, semEstado: 0, col };
  const get = (r, k) => col[k] === undefined ? '' : String(r[col[k]] == null ? '' : r[col[k]]).trim();
  for (const r of rows.slice(hi + 1)) {
    const id = get(r, 'id'); if (!/^\d+$/.test(id)) { if (r.some(c => String(c).trim())) P.ignoradas++; continue; }
    if (byId.has(id)) P.dupArq++;
    byId.set(id, r);
  }
  const have = new Map(DB.needs.filter(n => n.azureId).map(n => [String(n.azureId), n]));
  for (const [id, r] of byId) {
    const tituloOrig = get(r, 'titulo'), tags = get(r, 'tags'), estado = get(r, 'estado'), tipo = get(r, 'tipo'), respRaw = get(r, 'resp');
    const status = AZ_ST[azNorm(estado)] || 'Não iniciada'; if (!AZ_ST[azNorm(estado)]) { if (estado) P.estadosDesc[estado] = (P.estadosDesc[estado] || 0) + 1; else P.semEstado++; }
    const { nums, sq } = azSquad(tituloOrig, tags, get(r, 'squad'));
    const nome = (tituloOrig.replace(/^\s*\[squads?[^\]]*\]\s*-?\s*/i, '').replace(/^\s*time\s*\d+\s*-\s*squad\s*\d+\s*-\s*/i, '').trim()) || tituloOrig;
    const resp = !respRaw || /^unassigned$/i.test(respRaw) ? null : respRaw.split(' <')[0].trim();
    const fim = azDate(get(r, 'fim')), o = { id, nome, tituloOrig, tags, estado, tipo, status, resp, nums, sqId: sq ? sq.id : null, fim };
    const ex = have.get(id);
    if (!ex) { if (!sq) P.semSquad++; P.novos.push(o); continue; }
    const ch = []; o.status = AZ_ST[azNorm(estado)] || null;   // já existente: estado desconhecido nunca altera o status atual
    if (nome !== ex.nome) ch.push('título');
    if ((tipo || '') !== (ex.tipo || '') && tipo) ch.push('tipo');
    if ((resp || null) !== (ex.responsavel || null)) ch.push('responsável');
    if (tags !== (ex.tags || '')) ch.push('tags');
    if (estado && estado !== (ex.estadoOrigem || '')) ch.push('estado de origem');
    if (status && status !== ex.status) ch.push('status');
    if (ex.squadId === UNC && sq) ch.push('squad');
    if (ch.length) P.atualiza.push({ ...o, ex, ch }); else P.iguais++;
  }
  P.total = byId.size; return P;
}
function azApply(P) {
  let nN = 0, nU = 0; const hoje = TODAY;
  for (const o of P.novos) {
    if (DB.needs.some(n => String(n.azureId) === o.id)) continue;
    const st = o.status, desc = o.nome !== o.tituloOrig ? o.tituloOrig : '';
    DB.needs.push({ id: 'az-' + o.id, squadId: o.sqId || UNC, nome: o.nome, desc, acaoId: null, nivel: null, dataInicio: null, dataPrevista: null, dataConclusao: st === 'Concluída' && o.fim && o.fim <= hoje ? o.fim : null, status: st, validado: !!st, ltId: null, cpId: null, coachId: null,
      obs: o.nums.length > 1 ? 'Item abrange também as squads ' + o.nums.slice(1).join(', ') + '.' : '', dataPlanilha: null, marcaPlanilha: null, origemCelula: null,
      azureId: Number(o.id), tipo: o.tipo, responsavel: o.resp, tags: o.tags, estadoOrigem: o.estado, origem: 'planilha-itens',
      historico: [{ data: hoje, tipo: 'criacao', de: null, para: st, nota: 'Importado do Azure DevOps (ID ' + o.id + (o.tipo ? ', tipo ' + o.tipo : '') + ', estado "' + o.estado + '"' + (o.sqId ? '' : '; squad a classificar') + ').' }] });
    nN++;
  }
  for (const o of P.atualiza) {
    const n = o.ex; n.historico = n.historico || [];
    n.nome = o.nome; if (o.tipo) n.tipo = o.tipo; n.responsavel = o.resp; n.tags = o.tags; if (o.estado) n.estadoOrigem = o.estado; n.azureId = Number(o.id);
    if (!n.desc && o.nome !== o.tituloOrig) n.desc = o.tituloOrig;
    if (n.squadId === UNC && o.sqId) { n.squadId = o.sqId; }
    if (o.status && o.status !== n.status) {
      const de = n.status; n.status = o.status; n.validado = true;
      if (o.status === 'Concluída') { if (o.fim && o.fim <= hoje) n.dataConclusao = o.fim; } else if (de === 'Concluída') n.dataConclusao = null;
      n.historico.push({ data: hoje, tipo: 'status', de, para: o.status, nota: 'Atualizado pela importação do Azure DevOps (estado "' + o.estado + '").' });
    }
    const outros = o.ch.filter(c => c !== 'status');
    if (outros.length) n.historico.push({ data: hoje, tipo: 'edicao', nota: 'Atualizado pela importação do Azure DevOps: ' + outros.join(', ') + '.' });
    nU++;
  }
  DB.importacoes = DB.importacoes || [];
  DB.importacoes.push({ data: hoje, novos: nN, atualizados: nU, iguais: P.iguais });
  normalizarNecessidades(); save(); return { nN, nU };
}
function azImport() {
  const ult = (DB.importacoes || []).slice(-1)[0];
  modal('Importar necessidades do Azure DevOps', `<div class="note">Exporte o resultado da sua query do Azure DevOps (CSV ou Excel) e selecione o arquivo abaixo. Colunas reconhecidas: <b>ID, Work Item Type, Title, Assigned To, State, Tags</b> (também em português) e, opcionalmente, <b>Squad</b> e <b>Closed Date</b>. Itens já existentes (mesmo ID) são <b>atualizados</b>, nunca duplicados; histórico e vínculos são preservados. Nada é gravado antes da sua confirmação.</div>
  <label class="btn ghost" style="cursor:pointer;display:inline-block;margin:8px 0">Selecionar arquivo (.csv ou .xlsx)<input type="file" accept=".csv,.xlsx,.xls,.txt" data-azf hidden></label>${ult ? `<div class="small muted">Última importação: ${fmt(ult.data)} · ${ult.novos} nova(s), ${ult.atualizados} atualizada(s).</div>` : ''}
  <div id="azprev" aria-live="polite"></div>`, '<button class="btn ghost" data-act="close">Cancelar</button> <button class="btn cta" id="azgo" data-act="azGo" disabled>Confirmar importação</button>', 'avmodal');
  azPlan = null;
}
function azPreview(P) {
  const box = $('#azprev'), go = $('#azgo');
  if (P.erro) { box.innerHTML = `<div class="note warn">${esc(P.erro)}</div>`; go.disabled = true; azPlan = null; return; }
  azPlan = P; go.disabled = !(P.novos.length || P.atualiza.length);
  const est = Object.entries(P.estadosDesc);
  box.innerHTML = `<table class="tbl"><tbody>
  <tr><td>Itens válidos no arquivo</td><td><b>${P.total}</b></td></tr>
  <tr><td>Novos (serão criados)</td><td><b>${P.novos.length}</b>${P.semSquad ? ` <span class="muted small">· ${P.semSquad} sem squad identificada (ficam em "A Classificar")</span>` : ''}</td></tr>
  <tr><td>Já existentes, com alterações (serão atualizados)</td><td><b>${P.atualiza.length}</b></td></tr>
  <tr><td>Já existentes, sem alterações</td><td><b>${P.iguais}</b></td></tr>
  ${P.dupArq ? `<tr><td>Repetidos dentro do arquivo (vale a última ocorrência)</td><td><b>${P.dupArq}</b></td></tr>` : ''}
  ${P.ignoradas ? `<tr><td>Linhas ignoradas (sem ID numérico)</td><td><b>${P.ignoradas}</b></td></tr>` : ''}
  </tbody></table>
  ${est.length || P.semEstado ? `<div class="note warn">Estado não reconhecido: ${est.map(([k, v]) => esc(k) + ' (' + v + ')').join(', ')}${P.semEstado ? (est.length ? ', ' : '') + 'sem estado (' + P.semEstado + ')' : ''}. Novos itens assim entram como Não iniciada; os já existentes mantêm o status atual.</div>` : ''}
  ${P.atualiza.length ? `<details><summary class="small">Ver itens que serão atualizados (${P.atualiza.length})</summary><ul class="small">${P.atualiza.slice(0, 40).map(o => `<li>#${esc(o.id)} ${esc(o.nome)} — <span class="muted">${esc(o.ch.join(', '))}</span></li>`).join('')}${P.atualiza.length > 40 ? '<li class="muted">… e mais ' + (P.atualiza.length - 40) + '</li>' : ''}</ul></details>` : ''}`;
}
function download(name, text) {
  const box = () => copyBox(name, text);
  try { (window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null)).then(d => d ? d.save({ filename: name, data: text }).then(() => toast('Arquivo salvo.'), e => { if (!e || e.code !== 'declined') box(); }) : box(), box); } catch (e) { box(); }
}
function copyBox(name, text) {
  const m = $('#modals'); m.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:90;display:flex;align-items:center;justify-content:center;padding:16px"><div role="dialog" aria-modal="true" aria-label="Exportar" style="background:#fff;border-radius:8px;padding:18px;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;gap:10px"><b>' + esc(name) + '</b><textarea id="expTxt" readonly style="flex:1;min-height:240px;font:12px/1.4 monospace;border:1px solid #E0E0E0;border-radius:6px;padding:8px"></textarea><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" id="expCopy">Copiar conteúdo</button><button class="btn" id="expClose">Fechar</button></div></div></div>';
  const ta = $('#expTxt'); ta.value = text; ta.select();
  $('#expClose').onclick = () => { m.innerHTML = ''; };
  $('#expCopy').onclick = () => { ta.select(); try { navigator.clipboard.writeText(text).then(() => toast('Conteúdo copiado.'), () => toast('Selecione o texto e copie.')); } catch (e) { toast('Selecione o texto e copie.'); } };
}
const ACT = {
  nav: d => { ui.view = d.v; render(); }, advToggle: () => { ui.adv = !ui.adv; render(); }, toggleZero: () => { ui.showZero = !ui.showZero; render(); }, close: () => { const m = $$('.overlay'); m.length && m[m.length - 1].remove(); }, clearF: () => { F = {}; render(); }, toggleTime: d => { const cur = d.open === '1'; ui.open[d.id] = !cur; render(); }, expAll: d => { ['cp:CP I', 'cp:CP II', 'cp:CP III', 'cp:Sem CP', 'cp:A Classificar'].forEach(k => { ui.open[k] = d.v === '1'; }); render(); },
  nv: d => { ui.nv = d.v; render(); }, sort: d => { ui.sort = { k: d.k, d: ui.sort.k === d.k ? -ui.sort.d : 1 }; render(); },
  open: d => openNeed(d.id), editNeed: d => { closeModals(); needForm(d.id); }, saveNeed: d => saveNeed(d.id),
  chStatus: d => { closeModals(); askStatus(d.id); },
  okStatus: d => { const fd = Object.fromEntries(new FormData($('#sf'))), n = G(DB.needs, d.id); const e = setStatus(n, fd.para, fd.data || TODAY, fd.nota); if (e) { $('#sferr').textContent = e; return; } closeModals(); render(); toast('Status atualizado.'); },
  usePlan: (d, e) => { e.preventDefault(); $('#nf [name=dataPrevista]').value = d.d; },
  goPV: (d, e) => { e.preventDefault(); goNeeds({ status: PV }); }, goLate: (d, e) => { e.preventDefault(); goNeeds({}); ui.sort = { k: 'prev', d: 1 }; render(); },
  goMat: (d, e) => { e.preventDefault(); F = { nivel: '__nd' }; ui.view = 'mat'; render(); }, goQual: (d, e) => { e.preventDefault(); ui.cad = 'qual'; ui.view = 'cad'; render(); },
  tri: (d, e) => { const b = e.target.closest('.tri'), inp = b.previousElementSibling, nv = TRI_NEXT[inp.value || '']; inp.value = nv; b.dataset.v = nv; b.title = TRI_L[nv] + ' (clique para alternar)'; b.setAttribute('aria-label', b.dataset.lab + ': ' + TRI_L[nv] + '. Pressione para alternar.'); b.firstChild.textContent = TRI_I[nv]; inp.dispatchEvent(new Event('change', { bubbles: true })); },
  setInicio: (d, e) => { e.preventDefault(); const s = sqOf(d.id); closeModals(); const el = modal('Início do acompanhamento — ' + esc(sqName(s)), `<form class="form" id="inf"><label class="full">Data de início do acompanhamento<input type="date" name="inicio" value="${esc(s.inicio || '')}"></label><div class="err" id="inerr"></div></form>`, `<button class="btn ghost" data-act="cancelAval" data-id="${d.id}">Cancelar</button><button class="btn" data-act="saveInicio" data-id="${d.id}">Salvar</button>`); },
  saveInicio: d => { const v = $('#inf [name=inicio]').value || null, s = sqOf(d.id); if (!v) { $('#inerr').textContent = 'Selecione a data.'; return; } if (s.inicio !== v) { s.historico.push({ data: TODAY, campo: 'Início do acompanhamento', de: s.inicio ? fmt(s.inicio) : null, para: fmt(v) }); s.inicio = v; save(); } closeModals(); render(); openSquad(d.id); toast('Data de início salva.'); },
  openSq: d => openSquad(d.id), avaliar: d => { closeModals(); openAval(d.id); }, saveAval: d => saveAval(d.id), cancelAval: d => { closeModals(); openSquad(d.id); },
  editSquad: d => { closeModals(); squadForm(d.id); }, newSquad: () => { closeModals(); squadForm(); }, saveSquad: d => saveSquad(d.id),
  cadTab: d => { ui.cad = d.k; render(); }, quick: d => { ui.per = { a: d.a, b: d.b }; render(); },
  editTime: d => { const t = G(DB.times, d.id), nome = null; void t; },
  addPerson: d => personForm(d.l), editPerson: d => personForm(d.l, d.id),
  savePerson: d => { const fd = Object.fromEntries(new FormData($('#pf'))); if (!fd.nome.trim()) { $('#pferr').textContent = 'Informe o nome.'; return; } let p = d.id ? G(DB[d.l], d.id) : null; if (!p) { p = { id: uid(d.l), nome: '' }; DB[d.l].push(p); } p.nome = fd.nome.trim(); p.matricula = fd.matricula.trim() || null; delete p.nomeIncompleto; save(); closeModals(); render(); },
  azImport: () => azImport(),
  azGo: () => { if (!azPlan) return; const r = azApply(azPlan); azPlan = null; closeModals(); render(); toast('Importação concluída: ' + r.nN + ' nova(s), ' + r.nU + ' atualizada(s).'); },
  expJson: () => download('maturidade-asi-' + TODAY + '.json', JSON.stringify(DB, null, 1), 'application/json'),
  expCsv: () => download('necessidades-' + TODAY + '.csv', csv([['Squad', 'Time', 'Necessidade', 'Nível', 'Líder técnico', 'Célula de Produto', 'Agile Coach', 'Início', 'Prevista', 'Conclusão', 'Status', 'Data na planilha', 'Observações'], ...DB.needs.map(n => { const s = sqOf(n.squadId); return [sqName(s), timeName(s.timeId), n.nome, nivLabel(n.nivel), pName('lts', eff(n, 'ltId')), cpLabel(s.cpClasse), pName('coaches', eff(n, 'coachId')), n.dataInicio, n.dataPrevista, n.dataConclusao, n.status || PV, n.dataPlanilha, n.obs]; })]), 'text/csv'),
  reset: () => { if (SYNC.on) return toast('Indisponível com o banco compartilhado: restaurar apagaria os dados de todos.'); if (twice('reset', 'Clique de novo para descartar todas as alterações e restaurar os dados originais.')) { DB = clone(window.SEED); save(); F = {}; render(); toast('Dados originais restaurados.'); } },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t || !ACT[t.dataset.act]) return;
  if (t.tagName === 'A') e.preventDefault();
  ACT[t.dataset.act](t.dataset, e);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.sort !== undefined) { ui.sort = { k: t.value, d: 1 }; render(); }
  else if (t.dataset.f) { F[t.dataset.f] = t.value || undefined; render(); }
  else if (t.dataset.per) { ui.per[t.dataset.per] = t.value; render(); }
  else if (t.dataset.cmp) { ui.cmp = t.checked ? [...ui.cmp, t.dataset.cmp] : ui.cmp.filter(x => x !== t.dataset.cmp); render(); }
  else if (t.dataset.azf !== undefined && t.files[0]) { const bx = $('#azprev'); bx.innerHTML = '<div class="muted small">Lendo arquivo…</div>'; azReadFile(t.files[0]).then(rows => azPreview(azBuild(rows))).catch(() => { bx.innerHTML = '<div class="note warn">Não foi possível ler o arquivo. Use CSV ou Excel (.xlsx) exportado do Azure DevOps.</div>'; }); }
  else if (t.dataset.imp !== undefined && t.files[0]) { t.files[0].text().then(tx => { try { const d = JSON.parse(tx); if (!d.squads || !d.needs) throw 0;  DB = d; if (!DB.avaliacoes) DB.avaliacoes = []; normalizarNecessidades(); save(); render(); toast('Dados importados.'); } catch (x) { toast('Arquivo inválido.'); } }); }
});
document.addEventListener('input', e => { if (e.target.hasAttribute('data-q')) { ui.q = e.target.value; render(); } });
document.addEventListener('dragstart', e => { const k = e.target.closest && e.target.closest('.kcard'); if (k) e.dataTransfer.setData('text/plain', k.dataset.id); });
document.addEventListener('dragover', e => { const c = e.target.closest && e.target.closest('.col'); if (c) { e.preventDefault(); $$('.col').forEach(x => x.classList.toggle('over', x === c)); } });
document.addEventListener('dragleave', e => { if (e.target.classList && e.target.classList.contains('col')) e.target.classList.remove('over'); });
document.addEventListener('drop', e => {
  const c = e.target.closest && e.target.closest('.col'); if (!c) return; e.preventDefault(); $$('.col').forEach(x => x.classList.remove('over'));
  const id = e.dataTransfer.getData('text/plain'), n = G(DB.needs, id), to = c.dataset.col; if (!n || stOf(n) === to) return;
  if (to === PV) return toast('Não é possível devolver uma necessidade para "' + PV + '".');
  askStatus(id, to);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') ACT.close(); else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-act][tabindex], th[data-act][tabindex], .sqcard[tabindex], .nitem[tabindex]')) { e.preventDefault(); e.target.click(); } });
$('#pal').addEventListener('input', e => { const c = e.target.value, r = document.documentElement.style; r.setProperty('--brand', c); r.setProperty('--brand-dark', `color-mix(in srgb, ${c} 55%, #000)`); r.setProperty('--brand-mid', `color-mix(in srgb, ${c} 80%, #fff)`); r.setProperty('--brand-soft', `color-mix(in srgb, ${c} 9%, #fff)`); r.setProperty('--brand-line', `color-mix(in srgb, ${c} 22%, #fff)`); try { localStorage.setItem(KEY + '-pal2', c); } catch (x) { } });
try { const c = localStorage.getItem(KEY + '-pal2'); if (c) { $('#pal').value = c; $('#pal').dispatchEvent(new Event('input')); } } catch (x) { }

// ---------------- Supabase: autenticação (e-mail + senha) e sincronização ----------------
// Cliente mínimo por fetch (GoTrue + PostgREST), sem dependências externas. A chave abaixo é a chave PÚBLICA (publishable);
// a segurança vem do login + RLS no banco (somente usuários autenticados leem/gravam).
// Configuração vem de config.js (gerado no build a partir das variáveis de ambiente; nunca versionado).
const APPCFG = window.APP_CONFIG || {};
const SBU = String(APPCFG.supabaseUrl || '').replace(/\/+$/, ''), SBK = String(APPCFG.supabaseKey || '');
const ALLOWED_DOMAINS = (APPCFG.allowedDomains || []).map(d => String(d).toLowerCase());   // vazio = qualquer domínio (o banco também pode restringir: tabela allowed_domains)
const SES_KEY = KEY + '-sess';
const TBL = { times: 'times', coaches: 'coaches', lts: 'lts', squads: 'squads', acoes: 'acoes', needs: 'necessidades', niveis: 'niveis', criterios: 'criterios', marcacoes: 'marcacoes', nivelHist: 'nivel_hist', avaliacoes: 'avaliacoes' };
const CFG = ['importacao', 'migr', 'versao', 'geradoEm', 'cps'];     // chaves soltas do DB, guardadas em app_config
const SYNC = { on: false, snap: {}, timer: 0, retry: 0, p: null, again: false, state: 'off', err: '', last: null };
let SES = null, AUTHM = 'in';
const rid = (k, x) => k === 'marcacoes' ? x.squadId + '|' + x.criterioId : x.id;
const nat = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });

function docsOf(src) {
  const o = {};
  for (const [k, t] of Object.entries(TBL)) { const m = new Map(); for (const x of (src[k] || [])) { const id = rid(k, x); if (id) m.set(id, x); } o[t] = m; }
  const c = new Map(); for (const k of CFG) if (src[k] !== undefined && src[k] !== null) c.set(k, src[k]);
  o.app_config = c; return o;
}
function snapFrom(src) { const d = docsOf(src), s = {}; for (const t of Object.keys(d)) { s[t] = new Map(); for (const [id, x] of d[t]) s[t].set(id, JSON.stringify(x)); } return s; }
function ordenar(d) {
  d.niveis.sort((a, b) => a.ordem - b.ordem);
  for (const k of ['criterios', 'acoes']) d[k].sort((a, b) => (a.linha || 0) - (b.linha || 0) || nat(a.id, b.id));
  for (const k of ['times', 'coaches', 'lts', 'squads', 'needs']) d[k].sort((a, b) => nat(a.id, b.id));
  d.marcacoes.sort((a, b) => nat(rid('marcacoes', a), rid('marcacoes', b)));
  d.nivelHist.sort((a, b) => String(a.data).localeCompare(String(b.data)) || nat(a.id, b.id));
  d.avaliacoes.sort((a, b) => nat(a.id, b.id));
}

// ---- HTTP / sessão ----
const saveSes = s => { SES = s; try { s ? localStorage.setItem(SES_KEY, JSON.stringify(s)) : localStorage.removeItem(SES_KEY); } catch (e) { } };
const toSes = j => ({ at: j.access_token, rt: j.refresh_token, exp: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: (j.user || {}).email, uid: (j.user || {}).id });
async function sb(path, o = {}, retry = true) {
  if (!o.na && SES && SES.exp - 60 < Date.now() / 1000) await refreshSes();
  const h = { apikey: SBK, 'Content-Type': 'application/json', ...(o.h || {}) };
  if (!o.na && SES) h.Authorization = 'Bearer ' + SES.at;
  const r = await fetch(SBU + path, { method: o.m || 'GET', headers: h, body: o.b ? JSON.stringify(o.b) : undefined });
  if (r.status === 401 && retry && !o.na && SES) { await refreshSes(); return sb(path, o, false); }
  const tx = await r.text(); let j = null; try { j = tx ? JSON.parse(tx) : null; } catch (e) { }
  if (!r.ok) { const e = new Error((j && (j.msg || j.message || j.error_description || j.error)) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
  return j;
}
let _rf = null;
function refreshSes() {
  if (!SES) return Promise.reject(new Error('sem sessão'));
  if (!_rf) _rf = sb('/auth/v1/token?grant_type=refresh_token', { m: 'POST', b: { refresh_token: SES.rt }, na: 1 }, false)
    .then(j => { const e = SES.email, u = SES.uid, n = toSes(j); saveSes({ ...n, email: n.email || e, uid: n.uid || u }); })
    .catch(e => { if (e.status >= 400 && e.status < 500) saveSes(null); throw e; })
    .finally(() => { _rf = null; });
  return _rf;
}
const errPt = e => {
  const m = String((e && e.message) || '');
  if (e && e.confirm) return 'Cadastro criado, mas o projeto ainda exige confirmação por e-mail. No painel do Supabase, desative "Confirm email" (Authentication → Sign In / Providers → Email) e tente entrar.';
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(m)) return 'Não foi possível conectar ao servidor. Verifique a rede ou o proxy da empresa.';
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered|already been registered/i.test(m)) return 'Este e-mail já está cadastrado. Use "Entrar".';
  if (/dominio_nao_permitido|Database error saving new user/i.test(m)) return 'O domínio deste e-mail não está autorizado para cadastro.';
  if (/Password should|weak/i.test(m)) return 'Senha fraca: use pelo menos 6 caracteres (recomendado 8 ou mais).';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Muitas tentativas. Aguarde alguns instantes.';
  if (/invalid.*email|validate email/i.test(m)) return 'E-mail inválido.';
  return m || 'Erro inesperado.';
};

// ---- leitura / gravação ----
async function pullAll() {
  const out = {};
  for (const [k, t] of Object.entries(TBL)) { out[k] = []; for (let off = 0; ; off += 1000) { const rows = await sb('/rest/v1/' + t + '?select=id,data&order=id&limit=1000&offset=' + off); rows.forEach(r => out[k].push(r.data)); if (rows.length < 1000) break; } }
  (await sb('/rest/v1/app_config?select=id,data')).forEach(r => { out[r.id] = r.data; });
  return out;
}
function adopt(rem) {
  const d = {}; for (const k of Object.keys(TBL)) d[k] = rem[k] || [];
  for (const k of CFG) if (rem[k] !== undefined) d[k] = rem[k];
  d.migr = d.migr || {}; d.importacao = d.importacao || { avisos: [] }; d.cps = d.cps || [];
  ordenar(d); DB = d; SYNC.snap = snapFrom(DB);
  try { localStorage.setItem(KEY + '-cloud', JSON.stringify(DB)); } catch (e) { }
}
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
async function pushDiff() {
  const cur = docsOf(DB);
  for (const t of Object.keys(cur)) {
    const sm = SYNC.snap[t] || (SYNC.snap[t] = new Map()), up = [], del = [];
    for (const [id, x] of cur[t]) { const js = JSON.stringify(x); if (sm.get(id) !== js) up.push({ id, data: x, js }); }
    for (const id of sm.keys()) if (!cur[t].has(id)) del.push(id);
    for (const part of chunk(up, 150)) { await sb('/rest/v1/' + t + '?on_conflict=id', { m: 'POST', h: { Prefer: 'resolution=merge-duplicates,return=minimal' }, b: part.map(p => ({ id: p.id, data: p.data })) }); part.forEach(p => sm.set(p.id, p.js)); }
    for (const part of chunk(del, 80)) { await sb('/rest/v1/' + t + '?id=in.(' + encodeURIComponent(part.map(i => '"' + i.replace(/"/g, '\\"') + '"').join(',')) + ')', { m: 'DELETE', h: { Prefer: 'return=minimal' } }); part.forEach(i => sm.delete(i)); }
  }
}
function runSync() {
  if (!SYNC.on) return Promise.resolve();
  if (SYNC.p) { SYNC.again = true; return SYNC.p; }
  SYNC.state = 'saving'; renderAcct();
  SYNC.p = (async () => {
    try { await pushDiff(); SYNC.state = 'ok'; SYNC.err = ''; SYNC.last = new Date(); }
    catch (e) { SYNC.state = 'err'; SYNC.err = errPt(e); clearTimeout(SYNC.retry); SYNC.retry = setTimeout(syncSoon, 15000); }
  })().finally(() => { SYNC.p = null; if (SYNC.again) { SYNC.again = false; return runSync(); } renderAcct(); });
  return SYNC.p;
}
function syncSoon() { clearTimeout(SYNC.timer); SYNC.timer = setTimeout(runSync, 700); }
async function flush() { clearTimeout(SYNC.timer); await runSync(); while (SYNC.p) await SYNC.p; }

// ---- fluxo de entrada ----
async function startSync() {
  authBusy('Sincronizando com o banco…');
  const rem = await pullAll();
  SYNC.on = true;
  if (rem.squads.length || rem.needs.length) { adopt(rem); if (syncPlanilha()) save(); toast('Dados carregados do banco.'); }
  else if (!DB.squads.length) { SYNC.snap = snapFrom(DB); toast('Banco vazio: use "Importar backup" no menu lateral para carregar os dados.'); }
  else { SYNC.snap = {}; await pushDiff(); SYNC.last = new Date(); SYNC.state = 'ok'; toast('Banco vazio: dados locais migrados (' + DB.squads.length + ' squads, ' + DB.needs.length + ' necessidades).'); }
  SYNC.state = 'ok'; if (!SYNC.last) SYNC.last = new Date();
  $('#auth').hidden = true; renderAcct(); render();
}
function gate() {
  buildAuth();
  if (!SBU || !SBK) return authShow('Configuração do banco ausente (config.js). Use "Continuar sem conexão" ou peça ao responsável para configurar o deploy.');
  try { const r = localStorage.getItem(SES_KEY); if (r) SES = JSON.parse(r); } catch (e) { }
  if (!SES) return authShow('');
  authBusy('Entrando…');
  refreshSes().then(startSync).catch(e => { if (!SES) authShow('Sua sessão expirou. Entre novamente.'); else authShow(errPt(e), true); });
}
function buildAuth() {
  if ($('#auth')) return;
  const el = document.createElement('div'); el.id = 'auth'; el.className = 'authwrap'; el.hidden = true;
  el.innerHTML = `<div class="authbox" data-m="in"><div class="authbrand"><b>Maturidade Organizacional</b><span>ASI · Squads e necessidades</span></div>
  <div class="authwait" id="authwait" hidden><div class="spin" aria-hidden="true"></div><div id="authwaitt">Aguarde…</div></div>
  <div id="authmain"><div class="authtabs" role="tablist"><button type="button" role="tab" class="on" data-act="authTab" data-m="in">Entrar</button><button type="button" role="tab" data-act="authTab" data-m="up">Criar conta</button></div>
  <form id="authf" novalidate>
    <label>E-mail corporativo<input type="email" name="email" autocomplete="username" inputmode="email" required></label>
    <label>Senha<input type="password" name="pass" autocomplete="current-password" required></label>
    <label class="up">Confirmar senha<input type="password" name="pass2" autocomplete="new-password"></label>
    <div class="err" id="autherr" role="alert"></div>
    <button class="btn" type="submit" id="authgo">Entrar</button>
  </form>
  <button type="button" class="linkbtn" data-act="authOffline">Continuar sem conexão (dados só neste navegador)</button></div></div>`;
  document.body.appendChild(el);
}
function authShow(msg, retry) {
  const a = $('#auth'); a.hidden = false; $('#authwait').hidden = true; $('#authmain').hidden = false;
  $('#autherr').textContent = msg || ''; $('#authgo').disabled = false;
  if (retry) $('#autherr').insertAdjacentHTML('beforeend', ' <button type="button" class="linkbtn" data-act="authRetry">Tentar novamente</button>');
  const f = $('#authf'); if (f && !f.email.value) f.email.focus();
}
function authBusy(t) { const a = $('#auth'); a.hidden = false; $('#authmain').hidden = true; $('#authwait').hidden = false; $('#authwaitt').textContent = t; }
document.addEventListener('submit', async e => {
  if (e.target.id !== 'authf') return; e.preventDefault();
  const f = e.target, email = f.email.value.trim().toLowerCase(), pass = f.pass.value, err = m => { $('#autherr').textContent = m; };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Informe um e-mail válido.');
  if (ALLOWED_DOMAINS.length && !ALLOWED_DOMAINS.includes(email.split('@')[1])) return err('Use seu e-mail corporativo (@' + ALLOWED_DOMAINS.join(', @') + ').');
  if (pass.length < 6) return err('A senha deve ter pelo menos 6 caracteres.');
  if (AUTHM === 'up' && pass !== f.pass2.value) return err('As senhas não conferem.');
  err(''); $('#authgo').disabled = true;
  try {
    const j = await sb(AUTHM === 'up' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { m: 'POST', b: { email, password: pass }, na: 1 });
    if (!j || !j.access_token) { const x = new Error('confirm'); x.confirm = true; throw x; }
    saveSes(toSes(j)); f.pass.value = ''; f.pass2.value = '';
    await startSync();
  } catch (x) { authShow(errPt(x)); }
});

// ---- conta, migração do localStorage ----
function renderAcct() {
  const a = $('#acct'); if (!a) return;
  if (!SYNC.on) { a.innerHTML = '<div class="acctst off">Sem conexão com o banco · dados só neste navegador</div><div class="acctbtn"><button class="btn ghost" data-act="authRetry">Entrar</button><button class="btn ghost" data-act="expJson">Exportar backup</button><button class="btn ghost" data-act="impBk">Importar backup</button></div>'; return; }
  const hh = SYNC.last ? SYNC.last.toTimeString().slice(0, 5) : '';
  const st = SYNC.state === 'saving' ? 'Salvando…' : SYNC.state === 'err' ? 'Falha ao sincronizar. Nova tentativa em instantes.' : 'Sincronizado' + (hh ? ' às ' + hh : '');
  a.innerHTML = `<div class="acctem" title="${esc(SES && SES.email)}">${esc(SES && SES.email)}</div><div class="acctst ${SYNC.state}" ${SYNC.err ? 'title="' + esc(SYNC.err) + '"' : ''}>${esc(st)}</div>
  <div class="acctbtn"><button class="btn ghost" data-act="sbPull">Atualizar</button><button class="btn ghost" data-act="sbMigrar">Migrar dados locais</button><button class="btn ghost" data-act="expJson">Exportar backup</button><button class="btn ghost" data-act="impBk">Importar backup</button><button class="btn ghost" data-act="sbOut">Sair</button></div>`;
}
const LBL = { times: 'Times', coaches: 'Agile Coaches', lts: 'Líderes técnicos', squads: 'Squads', acoes: 'Categorias', needs: 'Necessidades', niveis: 'Níveis', criterios: 'Critérios', marcacoes: 'Marcações', nivelHist: 'Histórico de níveis', avaliacoes: 'Avaliações' };
function readLocal() { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.squads ? d : null; } catch (e) { return null; } }
function migrarModal() {
  const loc = readLocal();
  if (!loc) return modal('Migrar dados locais', '<div class="note">Não há dados locais neste navegador para enviar.</div>', '<button class="btn" data-act="close">Fechar</button>', 'narrow');
  const lk = docsOf(loc), ck = docsOf(DB);
  const rows = Object.entries(TBL).map(([k, t]) => { let n = 0, ex = 0; for (const id of lk[t].keys()) ck[t].has(id) ? ex++ : n++; return `<tr><td>${LBL[k]}</td><td class="num">${lk[t].size}</td><td class="num">${n}</td><td class="num">${ex}</td></tr>`; }).join('');
  modal('Migrar dados locais para o banco', `<div class="note">Envia o que está salvo <b>neste navegador</b> (antes do login) para o banco compartilhado. Nada é apagado no banco.</div>
  <table class="mig"><thead><tr><th>Coleção</th><th>Locais</th><th>Novos no banco</th><th>Já existem</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="small muted" style="margin-top:8px"><b>Só o que falta</b> mantém os registros que já estão no banco. <b>Sobrescrever</b> troca os registros do banco pelos locais quando o código for o mesmo.</div>`,
  '<button class="btn ghost" data-act="close">Cancelar</button><button class="btn ghost" data-act="sbMig" data-m="all">Enviar e sobrescrever existentes</button><button class="btn" data-act="sbMig" data-m="add">Enviar só o que falta</button>', 'narrow');
}
async function migrar(mode) {
  const loc = readLocal(); if (!loc) return; let add = 0, rep = 0;
  for (const k of Object.keys(TBL)) {
    const idx = new Map(DB[k].map((x, i) => [rid(k, x), i]));
    for (const x of (loc[k] || [])) { const id = rid(k, x); if (!id) continue; if (!idx.has(id)) { DB[k].push(clone(x)); add++; } else if (mode === 'all') { DB[k][idx.get(id)] = clone(x); rep++; } }
  }
  for (const k of CFG) if (loc[k] !== undefined && (DB[k] === undefined || DB[k] === null || (Array.isArray(DB[k]) && !DB[k].length))) DB[k] = clone(loc[k]);
  ordenar(DB); save(); closeModals(); render();
  toast('Enviando ao banco…'); await flush();
  toast(SYNC.state === 'ok' ? 'Migração concluída: ' + add + ' novo(s)' + (mode === 'all' ? ', ' + rep + ' sobrescrito(s)' : '') + '.' : 'A migração não foi concluída: ' + SYNC.err);
}
// ---- backup: exportar / importar (leva os dados de um endereço do app para outro) ----
function importModal() {
  modal('Importar backup', `<div class="note">Use o arquivo gerado em <b>Exportar backup</b> ou cole o conteúdo dele abaixo. Os dados atuais${SYNC.on ? ' <b>do banco compartilhado</b>' : ' deste navegador'} serão <b>substituídos</b> pelos do backup.</div>
  <label class="btn ghost" style="cursor:pointer;display:inline-block;margin:10px 0">Selecionar arquivo .json<input type="file" accept=".json,.txt,application/json" data-impf hidden></label>
  <textarea id="impTxt" aria-label="Conteúdo do backup" placeholder="…ou cole aqui o conteúdo do backup" style="width:100%;min-height:140px;font:12px/1.4 monospace;border:1px solid #E0E0E0;border-radius:6px;padding:8px"></textarea>
  <div class="err" id="imperr" role="alert"></div>`, '<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="impGo">Substituir dados pelo backup</button>', 'narrow');
}
async function importGo() {
  let d; try { d = JSON.parse($('#impTxt').value); } catch (e) { d = null; }
  if (!d || !Array.isArray(d.squads) || !Array.isArray(d.needs)) { $('#imperr').textContent = 'Conteúdo inválido: use o arquivo gerado em "Exportar backup".'; return; }
  for (const k of Object.keys(TBL)) if (!Array.isArray(d[k])) d[k] = [];
  d.migr = d.migr || {}; d.importacao = d.importacao || { avisos: [] };
  DB = d; normalizarNecessidades(); syncPlanilha(); if (SYNC.on) ordenar(DB); save(); closeModals(); render();
  if (SYNC.on) { toast('Enviando ao banco…'); await flush(); toast(SYNC.state === 'ok' ? 'Backup importado: ' + DB.squads.length + ' squads, ' + DB.needs.length + ' necessidades.' : 'Importação salva aqui, mas o envio ao banco falhou: ' + SYNC.err); }
  else toast('Backup importado: ' + DB.squads.length + ' squads, ' + DB.needs.length + ' necessidades.');
}
document.addEventListener('change', e => { const f = e.target; if (f.dataset && f.dataset.impf !== undefined && f.files[0]) f.files[0].text().then(tx => { $('#impTxt').value = tx; $('#imperr').textContent = ''; }); });
Object.assign(ACT, {
  impBk: () => importModal(), impGo: () => importGo(),
  authTab: d => { AUTHM = d.m; const b = $('.authbox'); b.dataset.m = d.m; $$('.authtabs button').forEach(x => x.classList.toggle('on', x.dataset.m === d.m)); $('#authgo').textContent = d.m === 'up' ? 'Criar conta e entrar' : 'Entrar'; $('#authf').pass.autocomplete = d.m === 'up' ? 'new-password' : 'current-password'; $('#autherr').textContent = ''; },
  authOffline: () => { SYNC.on = false; $('#auth').hidden = true; renderAcct(); render(); },
  authRetry: () => { const a = $('#auth'); a.hidden = false; if (SES) { authBusy('Entrando…'); refreshSes().then(startSync).catch(e => authShow(errPt(e), !!SES)); } else authShow(''); },
  sbOut: async () => {
    try { await flush(); } catch (e) { }
    try { if (SES) await sb('/auth/v1/logout', { m: 'POST' }); } catch (e) { }
    saveSes(null); SYNC.on = false; SYNC.snap = {}; try { localStorage.removeItem(KEY + '-cloud'); } catch (e) { }
    load(); renderAcct(); render(); authShow('');
  },
  sbPull: async () => { toast('Atualizando…'); try { await flush(); adopt(await pullAll()); if (syncPlanilha()) save(); render(); renderAcct(); toast('Dados atualizados do banco.'); } catch (e) { toast('Não foi possível atualizar: ' + errPt(e)); } },
  sbMigrar: () => migrarModal(),
  sbMig: d => migrar(d.m),
});

// ---- importação da planilha de maturidade (Ações de Melhoria: práticas nas linhas, squads nas colunas, "x" = atendido) ----
let matPlan = null;
const matN = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
function matCritIndex() {
  const byTxt = new Map(DB.criterios.map(c => [matN((c.codigo ? c.codigo + ' ' : '') + c.texto).toLowerCase(), c])), byCode = new Map(DB.criterios.filter(c => c.codigo).map(c => [c.codigo, c]));
  return t => { t = matN(t); if (!t) return null; return byTxt.get(t.toLowerCase()) || byCode.get((/^([A-Z]{2} \d+\.\d+)\b/.exec(t) || [])[1]) || null; };
}
function matSquad(h) {
  const cod = (/(\d{3})/.exec(h) || [])[1]; if (!cod) return null;
  const l = DB.squads.filter(s => s.codigo === cod); if (l.length <= 1) return l[0] || null;
  const tm = (/time\s*(\d{1,3})/i.exec(h) || [])[1];
  return (tm && l.find(s => (G(DB.times, s.timeId) || {}).codigo === tm.padStart(3, '0'))) || l[0];
}
function matParse(rows, arquivo) {
  const crit = matCritIndex();
  const hi = rows.findIndex(r => (r || []).some(v => /n[ií]veis de maturidade organizacional|valores culturais/i.test(matN(v))));
  if (hi < 0) return { erro: 'Não encontrei o cabeçalho da matriz (linha com "Níveis de Maturidade Organizacional" / "Valores Culturais").' };
  const body = rows.slice(hi + 1), W = Math.max(0, ...rows.map(r => (r || []).length));
  let pc = -1, best = 0;                                   // coluna das práticas: a que mais corresponde aos critérios cadastrados
  for (let c = 0; c < W; c++) { let n = 0; for (const r of body) if (crit((r || [])[c])) n++; if (n > best) { best = n; pc = c; } }
  if (pc < 0) return { erro: 'Nenhuma prática da planilha corresponde aos critérios cadastrados no app.' };
  const head = rows[hi] || [], cols = [];
  for (let c = pc + 1; c < W; c++) { const h = matN(head[c]); if (!h || /^obs/i.test(h)) continue; cols.push({ c, nome: h, obs: /^obs/i.test(matN(head[c + 1])) ? c + 1 : -1, sq: matSquad(h) }); }
  const linhas = [], semMatch = [], vistos = new Set();
  body.forEach((r, k) => { const txt = matN((r || [])[pc]); if (!txt) return; const cr = crit(txt); if (!cr) { semMatch.push({ linha: hi + 2 + k, txt }); return; } if (vistos.has(cr.id)) return; vistos.add(cr.id); linhas.push({ r: r || [], cr }); });
  const porSquad = new Map();
  for (const col of cols) {
    if (!col.sq) continue;
    const g = porSquad.get(col.sq.id) || { s: col.sq, colunas: [], xs: new Set(), obs: {} }; g.colunas.push(col.nome);
    for (const l of linhas) { if (/^x$/i.test(matN(l.r[col.c]))) g.xs.add(l.cr.id); const o = col.obs >= 0 ? matN(l.r[col.obs]) : ''; if (o) g.obs[l.cr.id] = (g.obs[l.cr.id] ? g.obs[l.cr.id] + ' | ' : '') + o; }
    porSquad.set(col.sq.id, g);
  }
  for (const g of porSquad.values()) {
    const av = avalOf(g.s.id), ans = av ? av.respostas || {} : {}, prev = Object.assign({}, ans); g.xs.forEach(c => { prev[c] = 'sim'; });
    g.novosSim = [...g.xs].filter(c => ans[c] !== 'sim').length; g.naoParaSim = [...g.xs].filter(c => ans[c] === 'nao').length;
    g.nivelAntes = g.s.nivel || null; g.nivelDepois = g.xs.size ? classify(prev).nivel : g.nivelAntes;
  }
  return { arquivo, praticas: linhas.length, semMatch, cols, porSquad, semSquad: cols.filter(c => !c.sq).map(c => c.nome) };
}
function matReadFile(file) {
  return azLoadXlsx().then(() => file.arrayBuffer()).then(buf => {
    const wb = XLSX.read(buf, { type: 'array' });
    const all = wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }));
    return all.find(rows => rows.some(r => r.some(v => /n[ií]veis de maturidade organizacional/i.test(matN(v))))) || all[0] || [];
  });
}
function matImport() {
  matPlan = null;
  modal('Importar planilha de maturidade', `<div class="note">Selecione a planilha de <b>Ações de Melhoria</b> (aba com a matriz <i>Níveis de Maturidade Organizacional</i>). Cada <b>"x"</b> vira <b>Sim</b> na avaliação da squad; células vazias não alteram nada. As práticas são casadas pelo código/texto dos critérios e as colunas pelo código da squad. Nada é gravado antes de você confirmar.</div>
  <label class="btn ghost" style="cursor:pointer;display:inline-block;margin:10px 0">Selecionar planilha (.xlsx)<input type="file" accept=".xlsx,.xls,.csv" data-matf hidden></label><div id="matprev"></div>`,
  '<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="matGo" id="matgo" disabled>Aplicar e sincronizar</button>', 'narrow');
}
function matPreview(P) {
  const box = $('#matprev'), go = $('#matgo'); matPlan = null;
  if (P.erro) { box.innerHTML = '<div class="note warn">' + esc(P.erro) + '</div>'; go.disabled = true; return; }
  const gs = [...P.porSquad.values()], comX = gs.filter(g => g.xs.size);
  box.innerHTML = `<div class="small" style="margin-bottom:6px"><b>${P.praticas}</b> prática(s) reconhecida(s) · <b>${P.cols.length}</b> coluna(s) de squad · <b>${comX.length}</b> squad(s) com "x"</div>
  <table class="mig"><thead><tr><th>Squad</th><th>"x"</th><th>Viram Sim</th><th>Nível atual → após</th></tr></thead><tbody>${gs.map(g => `<tr><td>${esc(sqName(g.s))}<div class="muted small">${esc(g.colunas.join(', '))}</div></td><td class="num">${g.xs.size}</td><td class="num">${g.novosSim}${g.naoParaSim ? '<div class="small late">' + g.naoParaSim + ' hoje "Não"</div>' : ''}</td><td>${g.xs.size ? esc(nivShort(g.nivelAntes)) + ' → <b>' + esc(nivShort(g.nivelDepois)) + '</b>' : '<span class="muted small">sem marcações: nada muda</span>'}</td></tr>`).join('')}</tbody></table>
  ${P.semSquad.length ? '<div class="note warn small" style="margin-top:8px">Colunas sem squad correspondente (ignoradas): ' + esc(P.semSquad.join(', ')) + '</div>' : ''}
  ${P.semMatch.length ? '<div class="note warn small" style="margin-top:8px">Linhas sem critério correspondente (ignoradas): ' + P.semMatch.slice(0, 6).map(x => 'linha ' + x.linha + ': ' + esc(x.txt.slice(0, 50))).join('; ') + (P.semMatch.length > 6 ? '…' : '') + '</div>' : ''}`;
  go.disabled = !comX.length; if (comX.length) matPlan = P;
}
function matApply(P) {
  const ids = []; let novas = 0;
  for (const [sid, g] of P.porSquad) {
    if (!g.xs.size) continue; ids.push(sid);
    for (const cid of g.xs) {
      let m = DB.marcacoes.find(x => x.squadId === sid && x.criterioId === cid);
      if (!m) { m = { squadId: sid, criterioId: cid }; DB.marcacoes.push(m); novas++; }
      m.aplicadaEm = null; m.origem = P.arquivo; m.importadaEm = TODAY; if (g.obs[cid]) m.obs = g.obs[cid];   // reaplicar: a planilha é a informação mais recente
    }
  }
  syncPlanilha(ids, P.arquivo);
  DB.importacao = DB.importacao || { avisos: [] }; DB.importacao.maturidade = { data: TODAY, arquivo: P.arquivo, squads: ids.length };
  save(); return { squads: ids.length, novas };
}
document.addEventListener('change', e => { const f = e.target; if (f.dataset && f.dataset.matf !== undefined && f.files[0]) { const bx = $('#matprev'); bx.innerHTML = '<div class="muted small">Lendo planilha…</div>'; const nome = f.files[0].name; matReadFile(f.files[0]).then(rows => matPreview(matParse(rows, nome))).catch(() => { bx.innerHTML = '<div class="note warn">Não foi possível ler o arquivo. Use a planilha .xlsx de Ações de Melhoria.</div>'; }); } });
Object.assign(ACT, {
  matImport: () => matImport(),
  resolverPend: (d, e) => resolverPend(d.id, e),
  matGo: () => { if (!matPlan) return; const r = matApply(matPlan); matPlan = null; closeModals(); render(); toast('Planilha aplicada: ' + r.squads + ' squad(s) sincronizada(s)' + (r.novas ? ', ' + r.novas + ' nova(s) marcação(ões)' : '') + '.'); },
});

load(); render(); gate();
window.__asi = { get DB() { return DB; }, getFiltered, stats, periodMetrics, setF: f => { F = f; render(); }, render };
})();
