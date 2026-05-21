/* ============================================================
   SMEE Finance — app.js
   Controle de Inadimplência — lógica principal
   ============================================================ */

'use strict';

// ---------- STATE ----------
const state = {
  rows: [],
  filtered: [],
  sortCol: 'dias',
  sortDir: -1,
  page: 0,
  perPage: 20,
  charts: {}
};

// Data de referência para cálculo de dias
// Usa a data atual do navegador automaticamente
const TODAY = new Date();
TODAY.setHours(0,0,0,0);

// ---------- HELPERS ----------
function daysBetween(dateVal) {
  const d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
  return Math.floor((TODAY - d) / 86400000);
}

function fmtBRL(v) {
  return 'R\u00a0' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v) {
  if (!v) return '—';
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR');
}

function faixaAtraso(dias) {
  if (dias <= 0)   return { label: 'No prazo',    cls: 'badge-green',  color: '#16a34a', order: 0 };
  if (dias <= 30)  return { label: '1–30 dias',   cls: 'badge-yellow', color: '#ca8a04', order: 1 };
  if (dias <= 60)  return { label: '31–60 dias',  cls: 'badge-amber',  color: '#d97706', order: 2 };
  if (dias <= 90)  return { label: '61–90 dias',  cls: 'badge-amber',  color: '#d97706', order: 3 };
  if (dias <= 180) return { label: '91–180 dias', cls: 'badge-red',    color: '#dc2626', order: 4 };
  return              { label: '+180 dias',    cls: 'badge-red',    color: '#991b1b', order: 5 };
}

function statusLabel(texto) {
  const t = (texto || '').toLowerCase();
  if (t.includes('judicial'))                        return { label: 'Judicial',      cls: 'badge-red' };
  if (t.includes('terceirizada') || t.includes('excelencia')) return { label: 'Terceirizada',  cls: 'badge-amber' };
  if (t.includes('parcelamento'))                    return { label: 'Parcelamento',  cls: 'badge-yellow' };
  if (t.includes('acordo'))                          return { label: 'Acordo',        cls: 'badge-yellow' };
  if (t.includes('falecido'))                        return { label: 'Falecido',      cls: 'badge-gray' };
  if (t.includes('devolvido'))                       return { label: 'Devolvido',     cls: 'badge-gray' };
  if (t.includes('prorrog'))                         return { label: 'Prorrogado',    cls: 'badge-yellow' };
  return { label: 'Em aberto', cls: 'badge-gray' };
}

// Converte serial do Excel para Date
function excelDateToJS(serial) {
  if (serial instanceof Date) return serial;
  if (typeof serial === 'string') {
    const d = new Date(serial);
    if (!isNaN(d)) return d;
    // dd/mm/yyyy
    const parts = serial.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const d2 = new Date(+parts[2], +parts[1]-1, +parts[0]);
      if (!isNaN(d2)) return d2;
    }
    return null;
  }
  if (typeof serial === 'number') {
    // Excel base: 1 jan 1900 = 1; corrige bug do 1900
    const d = new Date((serial - 25569) * 86400000);
    return isNaN(d) ? null : d;
  }
  return null;
}

// ---------- FILE HANDLING ----------
function setupUpload() {
  const zone  = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  });
  input.addEventListener('change', () => { if (input.files[0]) processFile(input.files[0]); });
}

function processFile(file) {
  const bar   = document.getElementById('progress-bar');
  const fill  = document.getElementById('progress-fill');
  const fname = document.getElementById('file-name');

  bar.style.display = 'block';
  fill.style.width  = '0%';
  fname.textContent = file.name;

  let pct = 0;
  const interval = setInterval(() => {
    pct = Math.min(pct + 10, 90);
    fill.style.width = pct + '%';
  }, 60);

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, { type: 'array', cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });

      parseRows(json, file.name);

      clearInterval(interval);
      fill.style.width = '100%';
      setTimeout(() => { bar.style.display = 'none'; fill.style.width = '0%'; }, 600);

    } catch (err) {
      clearInterval(interval);
      alert('Erro ao ler o arquivo: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// Mapeamento flexível de colunas SAP
const COL_MAP = {
  cliente:  ['cliente','Client','CLIENTE','cod. cliente','Cod.Cliente'],
  nome:     ['Nome 1','NOME 1','nome 1','nome','NOME','Name','Razão Social','razão social'],
  uf:       ['Rg','RG','rg','uf','UF','Estado','estado','Region','region'],
  ref:      ['Referência','REFERÊNCIA','referencia','Ref.','ref','Número NF','numero nf'],
  dataDoc:  ['Data doc.','DATA DOC.','data doc','Data Emissão','data emissao'],
  venc:     ['Vencim.em','VENCIM.EM','vencimento','Vencimento','Data Vencimento'],
  valor:    ['Mont.em MI','MONT.EM MI','mont.em mi','valor','Valor','Montante','montante','Saldo'],
  texto:    ['Texto','TEXTO','texto','Observação','observacao','Obs','obs','Descr.','descricao']
};

function findCol(row, candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const k = keys.find(k => k.trim().toLowerCase() === c.toLowerCase());
    if (k !== undefined) return row[k];
  }
  return '';
}

function parseRows(json, filename) {
  const parsed = [];
  for (const row of json) {
    const valorRaw = findCol(row, COL_MAP.valor);
    const valor = parseFloat(String(valorRaw).replace(',', '.'));
    if (isNaN(valor) || valor <= 0) continue;  // ignora negativos e zerados

    const vencRaw = findCol(row, COL_MAP.venc);
    const vencDate = excelDateToJS(vencRaw);
    if (!vencDate) continue;

    const dias = daysBetween(vencDate);

    parsed.push({
      cliente: String(findCol(row, COL_MAP.cliente) || '—'),
      nome:    String(findCol(row, COL_MAP.nome)    || '—').trim(),
      uf:      String(findCol(row, COL_MAP.uf)      || '—').trim(),
      ref:     String(findCol(row, COL_MAP.ref)     || '—').trim(),
      dataDoc: excelDateToJS(findCol(row, COL_MAP.dataDoc)),
      venc:    vencDate,
      valor,
      texto:   String(findCol(row, COL_MAP.texto)   || '').trim(),
      dias,
      faixa:   faixaAtraso(dias),
      status:  statusLabel(String(findCol(row, COL_MAP.texto) || ''))
    });
  }

  state.rows = parsed;
  state.filtered = parsed.slice();
  state.page = 0;

  updateSidebarStatus(filename, parsed.length);
  updateFileInfo(filename, json.length, parsed);
  populateStateFilter();
  document.getElementById('last-update').textContent = 'Atualizado ' + new Date().toLocaleString('pt-BR');
  document.getElementById('export-btn').style.display = 'inline-flex';
}

function updateSidebarStatus(name, count) {
  document.getElementById('status-dot').className  = 'status-dot active';
  document.getElementById('status-text').textContent = count.toLocaleString('pt-BR') + ' registros';
}

function updateFileInfo(name, total, parsed) {
  const vencidos = parsed.filter(r => r.dias > 0).length;
  document.getElementById('file-name').textContent = name;
  document.getElementById('info-total').textContent = total.toLocaleString('pt-BR');
  document.getElementById('info-pos').textContent   = parsed.length.toLocaleString('pt-BR');
  document.getElementById('info-venc').textContent  = vencidos.toLocaleString('pt-BR');
  document.getElementById('info-date').textContent  = new Date().toLocaleString('pt-BR');
  document.getElementById('file-info').style.display = 'block';
}

function populateStateFilter() {
  const sel = document.getElementById('filter-state');
  sel.innerHTML = '<option value="">Todos os estados</option>';
  const states = [...new Set(state.rows.map(r => r.uf))].sort();
  states.forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    sel.appendChild(o);
  });
}

// ---------- FILTERS & SORT ----------
function applyFilters() {
  const search  = (document.getElementById('search-input').value || '').toLowerCase();
  const uf      = document.getElementById('filter-state').value;
  const range   = document.getElementById('filter-range').value;
  const status  = document.getElementById('filter-status').value;

  state.filtered = state.rows.filter(r => {
    if (search && !r.nome.toLowerCase().includes(search) && !r.cliente.includes(search)) return false;
    if (uf && r.uf !== uf) return false;
    if (status && r.status.label !== status) return false;
    if (range !== '') {
      const rn = parseInt(range);
      if (rn === 0   && r.dias > 0)   return false;
      if (rn === 1   && !(r.dias >= 1  && r.dias <= 30))  return false;
      if (rn === 31  && !(r.dias >= 31 && r.dias <= 60))  return false;
      if (rn === 61  && !(r.dias >= 61 && r.dias <= 90))  return false;
      if (rn === 91  && !(r.dias >= 91 && r.dias <= 180)) return false;
      if (rn === 181 && r.dias <= 180) return false;
    }
    return true;
  });

  state.page = 0;
  renderTable();
}

function sortBy(col) {
  if (state.sortCol === col) state.sortDir *= -1;
  else { state.sortCol = col; state.sortDir = -1; }

  state.filtered.sort((a, b) => {
    const va = a[col], vb = b[col];
    if (typeof va === 'number') return (va - vb) * state.sortDir;
    return String(va).localeCompare(String(vb)) * state.sortDir;
  });
  renderTable();
}

// ---------- TABLE RENDER ----------
function renderTable() {
  const tbody   = document.getElementById('table-body');
  const empty   = document.getElementById('table-empty');
  const summary = document.getElementById('table-summary');

  if (!state.filtered.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    summary.textContent = '';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  const total = state.filtered.reduce((s, r) => s + r.valor, 0);
  summary.textContent = `${state.filtered.length.toLocaleString('pt-BR')} registros · Total: ${fmtBRL(total)}`;

  const start = state.page * state.perPage;
  const slice = state.filtered.slice(start, start + state.perPage);

  tbody.innerHTML = slice.map(r => `
    <tr>
      <td>${escHtml(r.cliente)}</td>
      <td class="td-name" title="${escHtml(r.nome)}">${escHtml(r.nome)}</td>
      <td>${escHtml(r.uf)}</td>
      <td style="font-family:monospace;font-size:12px">${escHtml(r.ref)}</td>
      <td>${fmtDate(r.venc)}</td>
      <td><span class="badge ${r.faixa.cls}">${r.dias > 0 ? r.dias + 'd' : r.dias === 0 ? 'Hoje' : r.faixa.label}</span></td>
      <td class="td-val" style="color:${r.dias > 90 ? '#dc2626' : r.dias > 30 ? '#d97706' : 'inherit'}">${fmtBRL(r.valor)}</td>
      <td><span class="badge ${r.status.cls}">${r.status.label}</span></td>
      <td class="td-obs" title="${escHtml(r.texto)}">${escHtml(r.texto)}</td>
    </tr>`).join('');

  renderPagination();
}

function renderPagination() {
  const pg   = document.getElementById('pagination');
  const total = Math.ceil(state.filtered.length / state.perPage);
  if (total <= 1) { pg.innerHTML = ''; return; }

  let html = `<button class="pg-btn" onclick="changePage(${state.page-1})" ${state.page===0?'disabled':''}>‹</button>`;

  const start = Math.max(0, state.page - 2);
  const end   = Math.min(total - 1, state.page + 2);
  if (start > 0) html += `<button class="pg-btn" onclick="changePage(0)">1</button>${start>1?'<span class="pg-info">…</span>':''}`;
  for (let i = start; i <= end; i++) {
    html += `<button class="pg-btn ${i===state.page?'active':''}" onclick="changePage(${i})">${i+1}</button>`;
  }
  if (end < total-1) html += `${end<total-2?'<span class="pg-info">…</span>':''}<button class="pg-btn" onclick="changePage(${total-1})">${total}</button>`;
  html += `<button class="pg-btn" onclick="changePage(${state.page+1})" ${state.page===total-1?'disabled':''}>›</button>`;
  html += `<span class="pg-info">Pág ${state.page+1}/${total} · ${state.filtered.length.toLocaleString('pt-BR')} itens</span>`;
  pg.innerHTML = html;
}

function changePage(p) {
  const total = Math.ceil(state.filtered.length / state.perPage);
  if (p < 0 || p >= total) return;
  state.page = p;
  renderTable();
  document.getElementById('tab-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- DASHBOARD ----------
function renderDashboard() {
  const rows = state.rows;
  if (!rows.length) {
    document.getElementById('dash-empty').style.display = 'block';
    ['metrics-grid','charts-row','chart-card full'].forEach(id => {
      const el = document.querySelector('.' + id);
      if (el) el.style.display = 'none';
    });
    return;
  }
  document.getElementById('dash-empty').style.display = 'none';

  const totalVal  = rows.reduce((s,r) => s+r.valor, 0);
  const vencidos  = rows.filter(r => r.dias > 0);
  const totalVenc = vencidos.reduce((s,r) => s+r.valor, 0);
  const criticos  = rows.filter(r => r.dias > 90).reduce((s,r) => s+r.valor, 0);
  const clientes  = new Set(vencidos.map(r => r.cliente)).size;
  const maxDias   = rows.reduce((mx,r) => Math.max(mx, r.dias), 0);

  document.getElementById('metrics-grid').innerHTML = `
    <div class="metric-card"><div class="metric-label">Total em aberto</div><div class="metric-value">${fmtBRL(totalVal)}</div><div class="metric-sub">${rows.length.toLocaleString('pt-BR')} parcelas</div></div>
    <div class="metric-card"><div class="metric-label">Total vencido</div><div class="metric-value danger">${fmtBRL(totalVenc)}</div><div class="metric-sub">${vencidos.length.toLocaleString('pt-BR')} parcelas</div></div>
    <div class="metric-card"><div class="metric-label">Crítico (+90 dias)</div><div class="metric-value danger">${fmtBRL(criticos)}</div><div class="metric-sub">${rows.filter(r=>r.dias>90).length} parcelas</div></div>
    <div class="metric-card"><div class="metric-label">Clientes inadimpl.</div><div class="metric-value warning">${clientes.toLocaleString('pt-BR')}</div><div class="metric-sub">clientes únicos</div></div>
    <div class="metric-card"><div class="metric-label">Maior atraso</div><div class="metric-value warning">${maxDias.toLocaleString('pt-BR')} dias</div><div class="metric-sub">pior caso</div></div>
  `;

  const FAIXAS = [
    { label: 'No prazo',    color: '#16a34a', filter: r => r.dias <= 0 },
    { label: '1–30 dias',   color: '#ca8a04', filter: r => r.dias >= 1  && r.dias <= 30 },
    { label: '31–60 dias',  color: '#d97706', filter: r => r.dias >= 31 && r.dias <= 60 },
    { label: '61–90 dias',  color: '#ea580c', filter: r => r.dias >= 61 && r.dias <= 90 },
    { label: '91–180 dias', color: '#dc2626', filter: r => r.dias >= 91 && r.dias <= 180 },
    { label: '+180 dias',   color: '#991b1b', filter: r => r.dias > 180 },
  ];

  const faixaData = FAIXAS.map(f => rows.filter(f.filter).reduce((s,r) => s+r.valor, 0));

  document.getElementById('bar-legend').innerHTML = FAIXAS.map((f,i) =>
    `<div class="legend-item"><span class="legend-dot" style="background:${f.color}"></span>${f.label}: ${fmtBRL(faixaData[i])}</div>`
  ).join('');

  buildChart('barChart', {
    type: 'bar',
    data: {
      labels: FAIXAS.map(f => f.label),
      datasets: [{
        data: faixaData.map(Math.round),
        backgroundColor: FAIXAS.map(f => f.color),
        borderRadius: 5,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtBRL(ctx.raw) } } },
      scales: { y: { ticks: { callback: v => 'R$' + Math.round(v/1000) + 'k' } }, x: { ticks: { font: { size: 11 } } } }
    }
  });

  const byStatus = {};
  rows.forEach(r => { byStatus[r.status.label] = (byStatus[r.status.label]||0)+1; });
  const sKeys = Object.keys(byStatus).sort((a,b) => byStatus[b]-byStatus[a]);
  const sColors = ['#1e40af','#dc2626','#d97706','#ca8a04','#64748b','#16a34a'];

  buildChart('statusChart', {
    type: 'doughnut',
    data: { labels: sKeys, datasets: [{ data: sKeys.map(k => byStatus[k]), backgroundColor: sColors.slice(0,sKeys.length), borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.raw } } }
    }
  });

  const byState = {};
  rows.filter(r => r.dias > 0).forEach(r => { byState[r.uf] = (byState[r.uf]||0)+r.valor; });
  const topStates = Object.entries(byState).sort((a,b) => b[1]-a[1]).slice(0,8);

  buildChart('stateChart', {
    type: 'bar',
    data: {
      labels: topStates.map(s => s[0]),
      datasets: [{ data: topStates.map(s => Math.round(s[1])), backgroundColor: '#1e40af', borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtBRL(ctx.raw) } } },
      scales: { x: { ticks: { callback: v => 'R$' + Math.round(v/1000) + 'k' } }, y: { ticks: { font: { size: 12 } } } }
    }
  });
}

function buildChart(id, config) {
  if (state.charts[id]) state.charts[id].destroy();
  const canvas = document.getElementById(id);
  if (!canvas) return;
  state.charts[id] = new Chart(canvas, config);
}

// ---------- TOP DEVEDORES ----------
function renderTop() {
  const empty  = document.getElementById('top-empty');
  const list   = document.getElementById('top-list');
  if (!state.rows.length) { empty.style.display='block'; list.innerHTML=''; return; }
  empty.style.display = 'none';

  const count       = parseInt(document.getElementById('top-count').value) || 20;
  const soloVencido = document.getElementById('top-vencidos-only').checked;
  const source      = soloVencido ? state.rows.filter(r => r.dias > 0) : state.rows;

  const byClient = {};
  source.forEach(r => {
    if (!byClient[r.cliente]) byClient[r.cliente] = { nome: r.nome, uf: r.uf, total: 0, count: 0, maxDias: 0 };
    byClient[r.cliente].total  += r.valor;
    byClient[r.cliente].count  += 1;
    byClient[r.cliente].maxDias = Math.max(byClient[r.cliente].maxDias, r.dias);
  });

  const top = Object.entries(byClient).sort((a,b) => b[1].total-a[1].total).slice(0, count);
  const maxTotal = top[0]?.[1]?.total || 1;

  list.innerHTML = top.map(([cod, d], i) => `
    <div class="top-item">
      <span class="top-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">#${i+1}</span>
      <div class="top-info">
        <div class="top-name" title="${escHtml(d.nome)}">${escHtml(d.nome)}</div>
        <div class="top-meta">Cód. ${escHtml(cod)} · ${escHtml(d.uf)} · ${d.count} parcelas · max ${d.maxDias}d atraso</div>
      </div>
      <div class="top-bar-wrap">
        <div class="top-bar-bg"><div class="top-bar-fill" style="width:${Math.round(d.total/maxTotal*100)}%"></div></div>
      </div>
      <div class="top-value">${fmtBRL(d.total)}</div>
    </div>`).join('');
}

// ---------- POR ESTADO ----------
function renderStateView() {
  const empty = document.getElementById('map-empty');
  const grid  = document.getElementById('state-grid');
  if (!state.rows.length) { empty.style.display='block'; grid.innerHTML=''; return; }
  empty.style.display = 'none';

  const byState = {};
  state.rows.forEach(r => {
    if (!byState[r.uf]) byState[r.uf] = { total: 0, vencido: 0, count: 0, clientes: new Set() };
    byState[r.uf].total += r.valor;
    byState[r.uf].count += 1;
    byState[r.uf].clientes.add(r.cliente);
    if (r.dias > 0) byState[r.uf].vencido += r.valor;
  });

  const sorted = Object.entries(byState).sort((a,b) => b[1].vencido-a[1].vencido);
  const maxVenc = sorted[0]?.[1]?.vencido || 1;

  grid.innerHTML = sorted.map(([uf, d]) => `
    <div class="state-card">
      <div class="state-code">${escHtml(uf)}</div>
      <div style="font-size:12px;color:#64748b">${d.clientes.size} clientes · ${d.count} parcelas</div>
      <div class="state-total">${fmtBRL(d.vencido)}</div>
      <div class="state-count">Total em aberto: ${fmtBRL(d.total)}</div>
      <div class="state-bar"><div class="state-bar-fill" style="width:${Math.round(d.vencido/maxVenc*100)}%"></div></div>
    </div>`).join('');
}

// ---------- EXPORT CSV ----------
function exportCSV() {
  const rows = state.filtered.length ? state.filtered : state.rows;
  if (!rows.length) { alert('Nenhum dado para exportar. Carregue um arquivo primeiro.'); return; }

  const header = ['Cód. Cliente','Razão Social','UF','Documento','Dt. Emissão','Dt. Vencimento','Dias Atraso','Faixa','Valor (R$)','Status','Observação'];
  const lines  = [header.join(';'), ...rows.map(r => [
    r.cliente, r.nome, r.uf, r.ref,
    fmtDate(r.dataDoc), fmtDate(r.venc), r.dias,
    r.faixa.label, r.valor.toFixed(2).replace('.',','),
    r.status.label, (r.texto||'').replace(/;/g,' ')
  ].join(';'))];

  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'inadimplencia_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- NAVIGATION ----------
const TAB_TITLES = {
  upload:    'Upload de Relatório SAP',
  dashboard: 'Dashboard',
  table:     'Lista de Inadimplentes',
  top:       'Top Devedores',
  map:       'Por Estado'
};

function switchTab(id) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === id);
  });
  document.querySelectorAll('.tab-section').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.getElementById('page-title').textContent = TAB_TITLES[id] || '';

  const showExport = (id === 'table') && state.rows.length > 0;
  document.getElementById('export-btn').style.display = showExport ? 'inline-flex' : 'none';

  if (id === 'dashboard') renderDashboard();
  if (id === 'table')     { applyFilters(); }
  if (id === 'top')       renderTop();
  if (id === 'map')       renderStateView();
}

// ---------- SIDEBAR TOGGLE ----------
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      switchTab(el.dataset.tab);
      if (window.innerWidth < 900) closeSidebar();
    });
  });

  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
}

function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); }

// ---------- UTILITY ----------
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ---------- INIT ----------
// Chamado por auth.js após login bem-sucedido
function initApp() {
  setupUpload();
  setupNav();
  document.getElementById('last-update').textContent = new Date().toLocaleDateString('pt-BR');
}
