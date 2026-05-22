/* ============================================================
   SMEE Finance — app.js v4
   Upload em abas separadas + análise de faturamento
   ============================================================ */
'use strict';

const state = {
  rows: [], filtered: [],
  fatMap: {}, fatTotal: 0, fatPeriodo: '',
  sortCol: 'dias', sortDir: -1,
  page: 0, perPage: 20,
  charts: {}
};

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

// ---------- HELPERS ----------
const daysBetween = d => Math.floor((TODAY - (d instanceof Date ? d : new Date(d))) / 86400000);
const fmtBRL = v => 'R\u00a0' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = v => v.toFixed(1).replace('.', ',') + '%';
const fmtDate = v => { if (!v) return '—'; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); };
const escHtml = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function faixaAtraso(dias) {
  if (dias <= 0)   return { label: 'No prazo',    cls: 'badge-green',  color: '#16a34a' };
  if (dias <= 30)  return { label: '1–30 dias',   cls: 'badge-yellow', color: '#ca8a04' };
  if (dias <= 60)  return { label: '31–60 dias',  cls: 'badge-amber',  color: '#d97706' };
  if (dias <= 90)  return { label: '61–90 dias',  cls: 'badge-amber',  color: '#ea580c' };
  if (dias <= 180) return { label: '91–180 dias', cls: 'badge-red',    color: '#dc2626' };
  return               { label: '+180 dias',    cls: 'badge-red',    color: '#991b1b' };
}

function statusLabel(texto) {
  const t = (texto || '').toLowerCase();
  if (t.includes('judicial'))                                  return { label: 'Judicial',     cls: 'badge-red' };
  if (t.includes('terceirizada') || t.includes('excelencia')) return { label: 'Terceirizada', cls: 'badge-amber' };
  if (t.includes('parcelamento'))                              return { label: 'Parcelamento', cls: 'badge-yellow' };
  if (t.includes('acordo'))                                    return { label: 'Acordo',       cls: 'badge-yellow' };
  if (t.includes('falecido'))                                  return { label: 'Falecido',     cls: 'badge-gray' };
  if (t.includes('devolvido'))                                 return { label: 'Devolvido',    cls: 'badge-gray' };
  if (t.includes('prorrog'))                                   return { label: 'Prorrogado',   cls: 'badge-yellow' };
  return { label: 'Em aberto', cls: 'badge-gray' };
}

function excelDateToJS(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v); if (!isNaN(d)) return d;
    const p = v.split(/[\/\-\.]/);
    if (p.length === 3) { const d2 = new Date(+p[2], +p[1]-1, +p[0]); if (!isNaN(d2)) return d2; }
    return null;
  }
  if (typeof v === 'number') { const d = new Date((v-25569)*86400000); return isNaN(d) ? null : d; }
  return null;
}

function extractClientCode(val) {
  const m = String(val || '').trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

function getPctClass(pct) {
  if (pct >= 50) return 'pct-danger';
  if (pct >= 20) return 'pct-warning';
  if (pct >= 10) return 'pct-amber';
  return 'pct-ok';
}

// ---------- COL MAP INADIMPLÊNCIA ----------
const COL_INADIMP = {
  cliente: ['Cliente','cliente','Cód. Cliente'],
  nome:    ['Nome 1','NOME 1','nome 1','Nome','Razão Social'],
  uf:      ['Rg','RG','rg','UF','Estado','Region'],
  ref:     ['Referência','REFERÊNCIA','referencia','Ref.'],
  dataDoc: ['Data doc.','DATA DOC.','Data Emissão'],
  venc:    ['Vencim.em','VENCIM.EM','vencimento','Vencimento','Data Vencimento'],
  valor:   ['Mont.em MI','MONT.EM MI','Valor','Montante','Saldo'],
  texto:   ['Texto','TEXTO','Observação','Obs','Descr.']
};

function findCol(row, candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const k = keys.find(k => k.trim().toLowerCase() === c.toLowerCase());
    if (k !== undefined) return row[k];
  }
  return '';
}

// ---------- FILE UPLOAD ----------
function setupUpload() {
  bindUploadZone('drop-zone-inadimp', 'file-input-inadimp', 'progfill-inadimp',
    'ustate-inadimp-idle', 'ustate-inadimp-loading', 'ustate-inadimp-done', processInadimp);
  bindUploadZone('drop-zone-fat', 'file-input-fat', 'progfill-fat',
    'ustate-fat-idle', 'ustate-fat-loading', 'ustate-fat-done', processFat);
}

// Registra todos os eventos de uma zona de upload
function bindUploadZone(zoneId, inputId, fillId, idleId, loadId, doneId, handler) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  // Clique na zona dispara o input — usa flag para evitar loop
  let _opening = false;
  zone.addEventListener('click', e => {
    if (['BUTTON','A','INPUT','LABEL'].includes(e.target.tagName)) return;
    if (_opening) return;
    _opening = true;
    input.click();
    setTimeout(() => { _opening = false; }, 500);
  });

  // Drag & drop
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragging'); });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file) doReadFile(file, fillId, idleId, loadId, doneId, handler);
  });

  // Quando o usuário seleciona um arquivo
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    doReadFile(file, fillId, idleId, loadId, doneId, handler);
    input.value = ''; // permite reselecionar o mesmo arquivo
  });
}

// Lê e processa o arquivo
function doReadFile(file, fillId, idleId, loadId, doneId, handler) {
  const fill = document.getElementById(fillId);
  document.getElementById(idleId).style.display = 'none';
  document.getElementById(loadId).style.display = 'block';
  document.getElementById(doneId).style.display  = 'none';
  fill.style.width = '0%';

  let pct = 0;
  const iv = setInterval(() => { pct = Math.min(pct + 12, 88); fill.style.width = pct + '%'; }, 60);

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
      clearInterval(iv);
      fill.style.width = '100%';
      setTimeout(() => {
        document.getElementById(loadId).style.display = 'none';
        document.getElementById(doneId).style.display = 'block';
        handler(json, file.name);
      }, 350);
    } catch (err) {
      clearInterval(iv);
      document.getElementById(loadId).style.display = 'none';
      document.getElementById(idleId).style.display = 'block';
      alert('Erro ao ler o arquivo: ' + err.message);
    }
  };
  reader.onerror = () => {
    clearInterval(iv);
    document.getElementById(loadId).style.display = 'none';
    document.getElementById(idleId).style.display = 'block';
    alert('Erro ao carregar o arquivo. Tente novamente.');
  };
  reader.readAsArrayBuffer(file);
}

// ---------- PROCESSA INADIMPLÊNCIA ----------
function processInadimp(json, filename) {
  const parsed = [];
  for (const row of json) {
    const valor = parseFloat(String(findCol(row, COL_INADIMP.valor)).replace(',', '.'));
    if (isNaN(valor) || valor <= 0) continue;
    const vencDate = excelDateToJS(findCol(row, COL_INADIMP.venc));
    if (!vencDate) continue;
    const cod  = extractClientCode(findCol(row, COL_INADIMP.cliente)) || String(findCol(row, COL_INADIMP.cliente)).trim();
    const dias = daysBetween(vencDate);
    parsed.push({
      cliente: cod,
      nome:    String(findCol(row, COL_INADIMP.nome)    || '—').trim(),
      uf:      String(findCol(row, COL_INADIMP.uf)      || '—').trim(),
      ref:     String(findCol(row, COL_INADIMP.ref)     || '—').trim(),
      dataDoc: excelDateToJS(findCol(row, COL_INADIMP.dataDoc)),
      venc:    vencDate, valor,
      texto:   String(findCol(row, COL_INADIMP.texto)   || '').trim(),
      dias, faixa: faixaAtraso(dias),
      status:  statusLabel(String(findCol(row, COL_INADIMP.texto) || ''))
    });
  }

  state.rows = parsed; state.filtered = parsed.slice(); state.page = 0;

  const vencidos   = parsed.filter(r => r.dias > 0);
  const totalValor = parsed.reduce((s, r) => s + r.valor, 0);

  // Sidebar
  document.getElementById('status-dot-inadimp').className  = 'status-dot active';
  document.getElementById('status-text-inadimp').textContent = parsed.length.toLocaleString('pt-BR') + ' reg.';
  document.getElementById('nav-status-inadimp').style.display = 'inline';
  document.getElementById('last-update').textContent = 'Atualizado ' + new Date().toLocaleString('pt-BR');
  document.getElementById('export-btn').style.display = 'inline-flex';

  // Upload done state
  document.getElementById('utitle-inadimp-done').textContent = filename;
  document.getElementById('usub-inadimp-done').textContent =
    parsed.length.toLocaleString('pt-BR') + ' registros carregados com sucesso';

  // Resumo
  document.getElementById('sumi-filename').textContent = filename;
  document.getElementById('sumi-total').textContent    = json.length.toLocaleString('pt-BR');
  document.getElementById('sumi-pos').textContent      = parsed.length.toLocaleString('pt-BR');
  document.getElementById('sumi-venc').textContent     = vencidos.length.toLocaleString('pt-BR');
  document.getElementById('sumi-valor').textContent    = fmtBRL(totalValor);
  document.getElementById('sumi-date').textContent     = new Date().toLocaleString('pt-BR');
  document.getElementById('summary-inadimp').style.display = 'block';

  populateStateFilter();
}

// ---------- PROCESSA FATURAMENTO ----------
function processFat(json, filename) {
  const header     = json[0];
  const keys       = Object.keys(header);
  let clienteKey   = null, fatKey = null, periodoKey = null;

  for (const [k, v] of Object.entries(header)) {
    const s = String(v || '').trim().toUpperCase();
    if (s === 'CLIENTE')                                clienteKey = k;
    if (s === 'FATURAMENTO')                            fatKey     = k;
    if (s === 'PERÍODO/ANO' || s === 'PERIODO/ANO')    periodoKey = k;
  }
  if (!clienteKey) clienteKey = keys[18];
  if (!fatKey)     fatKey     = keys[29];
  if (!periodoKey) periodoKey = keys[20];

  const fatMap = {};
  let fatTotal = 0, periodo = '';

  for (let i = 1; i < json.length; i++) {
    const row = json[i];
    const cod = extractClientCode(row[clienteKey]);
    if (!cod) continue;
    const val = parseFloat(String(row[fatKey] || '0').replace(',', '.'));
    if (isNaN(val)) continue;
    fatMap[cod] = (fatMap[cod] || 0) + val;
    if (!periodo && row[periodoKey] && String(row[periodoKey]).trim()) periodo = String(row[periodoKey]).trim();
  }

  fatTotal = Object.values(fatMap).filter(v => v > 0).reduce((s, v) => s + v, 0);
  state.fatMap = fatMap; state.fatTotal = fatTotal; state.fatPeriodo = periodo;

  document.getElementById('status-dot-fat').className  = 'status-dot active';
  document.getElementById('status-text-fat').textContent = Object.keys(fatMap).length + ' clientes';
  document.getElementById('nav-status-fat').style.display = 'inline';

  document.getElementById('utitle-fat-done').textContent = filename;
  document.getElementById('usub-fat-done').textContent =
    Object.keys(fatMap).length + ' clientes · Total: ' + fmtBRL(fatTotal) + (periodo ? ' · ' + periodo : '');

  document.getElementById('sumf-filename').textContent = filename;
  document.getElementById('sumf-periodo').textContent  = periodo || '—';
  document.getElementById('sumf-clientes').textContent = Object.keys(fatMap).length.toLocaleString('pt-BR');
  document.getElementById('sumf-total').textContent    = fmtBRL(fatTotal);
  document.getElementById('summary-fat').style.display = 'block';
}

// ---------- FILTROS ----------
function populateStateFilter() {
  const sel = document.getElementById('filter-state');
  sel.innerHTML = '<option value="">Todos os estados</option>';
  [...new Set(state.rows.map(r => r.uf))].sort().forEach(s => {
    const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o);
  });
}

function applyFilters() {
  const search = (document.getElementById('search-input').value || '').toLowerCase();
  const uf     = document.getElementById('filter-state').value;
  const range  = document.getElementById('filter-range').value;
  const status = document.getElementById('filter-status').value;

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
  state.page = 0; renderTable();
}

function sortBy(col) {
  if (state.sortCol === col) state.sortDir *= -1;
  else { state.sortCol = col; state.sortDir = -1; }
  state.filtered.sort((a, b) => typeof a[col] === 'number' ? (a[col]-b[col])*state.sortDir : String(a[col]).localeCompare(String(b[col]))*state.sortDir);
  renderTable();
}

// ---------- TABELA ----------
function renderTable() {
  const tbody   = document.getElementById('table-body');
  const empty   = document.getElementById('table-empty');
  const summary = document.getElementById('table-summary');
  const hasFat  = state.fatTotal > 0;

  if (!state.filtered.length) { tbody.innerHTML = ''; empty.style.display = 'block'; summary.textContent = ''; document.getElementById('pagination').innerHTML = ''; return; }
  empty.style.display = 'none';

  const total = state.filtered.reduce((s, r) => s + r.valor, 0);
  summary.textContent = `${state.filtered.length.toLocaleString('pt-BR')} registros · Total: ${fmtBRL(total)}`;

  const slice = state.filtered.slice(state.page * state.perPage, (state.page + 1) * state.perPage);

  tbody.innerHTML = slice.map(r => {
    const fatC = state.fatMap[r.cliente] || 0;
    const pctHtml = (hasFat && fatC > 0)
      ? `<span class="pct-badge ${getPctClass(r.valor / fatC * 100)}">${fmtPct(r.valor / fatC * 100)}</span>`
      : '<span style="color:#94a3b8;font-size:12px">—</span>';

    return `<tr>
      <td>${escHtml(r.cliente)}</td>
      <td class="td-name" title="${escHtml(r.nome)}">${escHtml(r.nome)}</td>
      <td>${escHtml(r.uf)}</td>
      <td style="font-family:monospace;font-size:12px">${escHtml(r.ref)}</td>
      <td>${fmtDate(r.venc)}</td>
      <td><span class="badge ${r.faixa.cls}">${r.dias > 0 ? r.dias+'d' : r.dias === 0 ? 'Hoje' : r.faixa.label}</span></td>
      <td class="td-val" style="color:${r.dias>90?'#dc2626':r.dias>30?'#d97706':'inherit'}">${fmtBRL(r.valor)}</td>
      <td style="text-align:center">${pctHtml}</td>
      <td><span class="badge ${r.status.cls}">${r.status.label}</span></td>
      <td class="td-obs" title="${escHtml(r.texto)}">${escHtml(r.texto)}</td>
    </tr>`;
  }).join('');

  renderPagination();
}

function renderPagination() {
  const pg = document.getElementById('pagination');
  const total = Math.ceil(state.filtered.length / state.perPage);
  if (total <= 1) { pg.innerHTML = ''; return; }
  let html = `<button class="pg-btn" onclick="changePage(${state.page-1})" ${state.page===0?'disabled':''}>‹</button>`;
  const s = Math.max(0, state.page-2), e = Math.min(total-1, state.page+2);
  if (s > 0) html += `<button class="pg-btn" onclick="changePage(0)">1</button>${s>1?'<span class="pg-info">…</span>':''}`;
  for (let i = s; i <= e; i++) html += `<button class="pg-btn ${i===state.page?'active':''}" onclick="changePage(${i})">${i+1}</button>`;
  if (e < total-1) html += `${e<total-2?'<span class="pg-info">…</span>':''}<button class="pg-btn" onclick="changePage(${total-1})">${total}</button>`;
  html += `<button class="pg-btn" onclick="changePage(${state.page+1})" ${state.page===total-1?'disabled':''}>›</button>`;
  html += `<span class="pg-info">Pág ${state.page+1}/${total} · ${state.filtered.length.toLocaleString('pt-BR')} itens</span>`;
  pg.innerHTML = html;
}

function changePage(p) {
  const total = Math.ceil(state.filtered.length / state.perPage);
  if (p < 0 || p >= total) return;
  state.page = p; renderTable();
}

// ---------- DASHBOARD ----------
function renderDashboard() {
  const rows = state.rows, hasFat = state.fatTotal > 0;
  if (!rows.length) { document.getElementById('dash-empty').style.display = 'block'; return; }
  document.getElementById('dash-empty').style.display = 'none';

  const totalVal  = rows.reduce((s, r) => s + r.valor, 0);
  const vencidos  = rows.filter(r => r.dias > 0);
  const totalVenc = vencidos.reduce((s, r) => s + r.valor, 0);
  const criticos  = rows.filter(r => r.dias > 90).reduce((s, r) => s + r.valor, 0);
  const nClientes = new Set(vencidos.map(r => r.cliente)).size;
  const maxDias   = rows.reduce((mx, r) => Math.max(mx, r.dias), 0);
  const pctFat    = hasFat ? (totalVenc / state.fatTotal * 100) : null;

  if (hasFat && state.fatPeriodo) document.getElementById('dash-period-label').textContent = `Inadimplência vs faturamento · Período: ${state.fatPeriodo}`;

  document.getElementById('metrics-grid').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Total em aberto</div>
      <div class="metric-value">${fmtBRL(totalVal)}</div>
      <div class="metric-sub">${rows.length.toLocaleString('pt-BR')} parcelas</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total vencido</div>
      <div class="metric-value danger">${fmtBRL(totalVenc)}</div>
      <div class="metric-sub">${vencidos.length.toLocaleString('pt-BR')} parcelas vencidas</div>
    </div>
    ${hasFat ? `
    <div class="metric-card highlight-card">
      <div class="metric-label">% do faturamento</div>
      <div class="metric-value ${pctFat >= 10 ? 'danger' : pctFat >= 5 ? 'warning' : 'success'}">${fmtPct(pctFat)}</div>
      <div class="metric-sub">Inadimplência ÷ faturamento total</div>
    </div>` : `
    <div class="metric-card metric-muted" style="cursor:pointer" onclick="switchTab('upload-fat')" title="Clique para carregar faturamento">
      <div class="metric-label">% do faturamento</div>
      <div class="metric-value" style="font-size:13px;color:#94a3b8;margin-top:4px">Carregue o faturamento<br>para ver este indicador →</div>
    </div>`}
    <div class="metric-card">
      <div class="metric-label">Crítico (+90 dias)</div>
      <div class="metric-value danger">${fmtBRL(criticos)}</div>
      <div class="metric-sub">${rows.filter(r=>r.dias>90).length} parcelas</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Clientes inadimpl.</div>
      <div class="metric-value warning">${nClientes.toLocaleString('pt-BR')}</div>
      <div class="metric-sub">clientes únicos vencidos</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Maior atraso</div>
      <div class="metric-value warning">${maxDias.toLocaleString('pt-BR')} dias</div>
      <div class="metric-sub">pior caso no portfólio</div>
    </div>
  `;

  if (hasFat) { renderFatIndicators(totalVenc, criticos, rows); document.getElementById('fat-indicators').style.display = 'block'; }
  else document.getElementById('fat-indicators').style.display = 'none';

  renderBarChart(rows);
  renderStatusChart(rows);
  renderStateChart(rows);
}

function renderFatIndicators(totalVenc, criticos, rows) {
  const fat = state.fatTotal;
  const pctTotal = totalVenc / fat * 100;
  const pctCrit  = criticos  / fat * 100;

  const inadByClient = {};
  rows.filter(r => r.dias > 0).forEach(r => { inadByClient[r.cliente] = (inadByClient[r.cliente]||0) + r.valor; });

  const alertas = Object.entries(inadByClient)
    .map(([cod, inad]) => ({ cod, inad, fatC: state.fatMap[cod]||0, pct: (state.fatMap[cod]||0) > 0 ? inad/(state.fatMap[cod])*100 : null }))
    .filter(x => x.pct !== null && x.pct >= 30)
    .sort((a, b) => b.pct - a.pct).slice(0, 5);

  document.getElementById('fat-cards').innerHTML = `
    <div class="fat-card">
      <div class="fat-card-label">Inadimplência total ÷ faturamento</div>
      <div class="fat-card-bar-wrap"><div class="fat-card-bar" style="width:${Math.min(pctTotal,100)}%;background:${pctTotal>=10?'#dc2626':pctTotal>=5?'#d97706':'#16a34a'}"></div></div>
      <div class="fat-card-values">
        <span class="fat-pct ${pctTotal>=10?'danger':pctTotal>=5?'warning':'success'}">${fmtPct(pctTotal)}</span>
        <span class="fat-detail">${fmtBRL(totalVenc)} de ${fmtBRL(fat)} faturados</span>
      </div>
    </div>
    <div class="fat-card">
      <div class="fat-card-label">Crítico (+90 dias) ÷ faturamento</div>
      <div class="fat-card-bar-wrap"><div class="fat-card-bar" style="width:${Math.min(pctCrit,100)}%;background:${pctCrit>=5?'#dc2626':'#d97706'}"></div></div>
      <div class="fat-card-values">
        <span class="fat-pct ${pctCrit>=5?'danger':'warning'}">${fmtPct(pctCrit)}</span>
        <span class="fat-detail">${fmtBRL(criticos)} de ${fmtBRL(fat)} faturados</span>
      </div>
    </div>
    ${alertas.length ? `
    <div class="fat-card fat-card-wide">
      <div class="fat-card-label">⚠️ Clientes com inadimplência acima de 30% do faturado</div>
      ${alertas.map(a => {
        const nome = rows.find(r => r.cliente === a.cod)?.nome || a.cod;
        return `<div class="fat-alert-row">
          <span class="fat-alert-name" title="${escHtml(nome)}">${escHtml(nome.substring(0,28))}${nome.length>28?'…':''}</span>
          <div class="fat-alert-bar-bg"><div class="fat-alert-bar" style="width:${Math.min(a.pct,100)}%"></div></div>
          <span class="fat-alert-pct danger">${fmtPct(a.pct)}</span>
          <span class="fat-alert-vals">${fmtBRL(a.inad)} de ${fmtBRL(a.fatC)}</span>
        </div>`;
      }).join('')}
    </div>` : ''}
  `;

  const topClientes = Object.entries(inadByClient)
    .map(([cod, inad]) => ({ cod, nome: rows.find(r=>r.cliente===cod)?.nome||cod, inad, fatC: state.fatMap[cod]||0, pct: (state.fatMap[cod]||0)>0?inad/state.fatMap[cod]*100:0 }))
    .filter(x => x.fatC > 0).sort((a,b) => b.inad-a.inad).slice(0, 15);

  buildChart('clientePctChart', {
    type: 'bar',
    data: {
      labels: topClientes.map(c => c.nome.substring(0,22)+(c.nome.length>22?'…':'')),
      datasets: [
        { label: 'Valor inadimplente (R$)', data: topClientes.map(c=>Math.round(c.inad)), backgroundColor: '#1e40af', borderRadius: 4, yAxisID: 'y' },
        { label: '% sobre faturado', data: topClientes.map(c=>+c.pct.toFixed(1)), type:'line', borderColor:'#dc2626', backgroundColor:'rgba(220,38,38,.1)', borderWidth:2, pointRadius:4, yAxisID:'y1', tension:.3 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{position:'top',labels:{font:{size:11},boxWidth:12}}, tooltip:{callbacks:{label:ctx=>ctx.datasetIndex===0?'Inadimplência: '+fmtBRL(ctx.raw):'% faturado: '+ctx.raw+'%'}} },
      scales: { x:{ticks:{font:{size:10},maxRotation:40}}, y:{position:'left',ticks:{callback:v=>'R$'+Math.round(v/1000)+'k'}}, y1:{position:'right',ticks:{callback:v=>v+'%'},grid:{drawOnChartArea:false}} }
    }
  });
}

function renderBarChart(rows) {
  const FAIXAS = [
    {label:'No prazo',color:'#16a34a',fn:r=>r.dias<=0},{label:'1–30 dias',color:'#ca8a04',fn:r=>r.dias>=1&&r.dias<=30},
    {label:'31–60 dias',color:'#d97706',fn:r=>r.dias>=31&&r.dias<=60},{label:'61–90 dias',color:'#ea580c',fn:r=>r.dias>=61&&r.dias<=90},
    {label:'91–180 dias',color:'#dc2626',fn:r=>r.dias>=91&&r.dias<=180},{label:'+180 dias',color:'#991b1b',fn:r=>r.dias>180}
  ];
  const data = FAIXAS.map(f => rows.filter(f.fn).reduce((s,r)=>s+r.valor,0));
  document.getElementById('bar-legend').innerHTML = FAIXAS.map((f,i)=>`<div class="legend-item"><span class="legend-dot" style="background:${f.color}"></span>${f.label}: ${fmtBRL(data[i])}</div>`).join('');
  buildChart('barChart',{type:'bar',data:{labels:FAIXAS.map(f=>f.label),datasets:[{data:data.map(Math.round),backgroundColor:FAIXAS.map(f=>f.color),borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>fmtBRL(ctx.raw)}}},scales:{y:{ticks:{callback:v=>'R$'+Math.round(v/1000)+'k'}}}}});
}

function renderStatusChart(rows) {
  const by={}; rows.forEach(r=>{by[r.status.label]=(by[r.status.label]||0)+1;});
  const sk=Object.keys(by).sort((a,b)=>by[b]-by[a]);
  buildChart('statusChart',{type:'doughnut',data:{labels:sk,datasets:[{data:sk.map(k=>by[k]),backgroundColor:['#1e40af','#dc2626','#d97706','#ca8a04','#64748b','#16a34a'].slice(0,sk.length),borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12,padding:10}}}}});
}

function renderStateChart(rows) {
  const by={}; rows.filter(r=>r.dias>0).forEach(r=>{by[r.uf]=(by[r.uf]||0)+r.valor;});
  const top=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,8);
  buildChart('stateChart',{type:'bar',data:{labels:top.map(s=>s[0]),datasets:[{data:top.map(s=>Math.round(s[1])),backgroundColor:'#1e40af',borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>fmtBRL(ctx.raw)}}},scales:{x:{ticks:{callback:v=>'R$'+Math.round(v/1000)+'k'}}}}});
}

function buildChart(id, config) {
  if (state.charts[id]) state.charts[id].destroy();
  const c = document.getElementById(id); if (!c) return;
  state.charts[id] = new Chart(c, config);
}

// ---------- TOP DEVEDORES ----------
function renderTop() {
  const empty=document.getElementById('top-empty'),list=document.getElementById('top-list');
  if (!state.rows.length){empty.style.display='block';list.innerHTML='';return;}
  empty.style.display='none';
  const count=parseInt(document.getElementById('top-count').value)||20;
  const soloVenc=document.getElementById('top-vencidos-only').checked;
  const source=soloVenc?state.rows.filter(r=>r.dias>0):state.rows;
  const hasFat=state.fatTotal>0;
  const by={};
  source.forEach(r=>{if(!by[r.cliente])by[r.cliente]={nome:r.nome,uf:r.uf,total:0,count:0,maxDias:0};by[r.cliente].total+=r.valor;by[r.cliente].count++;by[r.cliente].maxDias=Math.max(by[r.cliente].maxDias,r.dias);});
  const top=Object.entries(by).sort((a,b)=>b[1].total-a[1].total).slice(0,count);
  const maxTot=top[0]?.[1]?.total||1;
  list.innerHTML=top.map(([cod,d],i)=>{
    const fatC=hasFat?(state.fatMap[cod]||0):0;
    const pct=(hasFat&&fatC>0)?(d.total/fatC*100):null;
    const pctHtml=pct!==null?`<div class="top-pct-wrap"><span class="top-pct-label">% faturado</span><span class="fat-pct ${getPctClass(pct)}" style="font-size:15px">${fmtPct(pct)}</span><span class="fat-detail">${fmtBRL(d.total)} de ${fmtBRL(fatC)}</span></div>`:'';
    return `<div class="top-item"><span class="top-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">#${i+1}</span><div class="top-info"><div class="top-name" title="${escHtml(d.nome)}">${escHtml(d.nome)}</div><div class="top-meta">Cód. ${escHtml(cod)} · ${escHtml(d.uf)} · ${d.count} parcelas · max ${d.maxDias}d atraso</div></div><div class="top-bar-wrap"><div class="top-bar-bg"><div class="top-bar-fill" style="width:${Math.round(d.total/maxTot*100)}%"></div></div></div>${pctHtml}<div class="top-value">${fmtBRL(d.total)}</div></div>`;
  }).join('');
}

// ---------- POR ESTADO ----------
function renderStateView() {
  const empty=document.getElementById('map-empty'),grid=document.getElementById('state-grid');
  if(!state.rows.length){empty.style.display='block';grid.innerHTML='';return;}
  empty.style.display='none';
  const by={};
  state.rows.forEach(r=>{if(!by[r.uf])by[r.uf]={total:0,vencido:0,count:0,clientes:new Set()};by[r.uf].total+=r.valor;by[r.uf].count++;by[r.uf].clientes.add(r.cliente);if(r.dias>0)by[r.uf].vencido+=r.valor;});
  const sorted=Object.entries(by).sort((a,b)=>b[1].vencido-a[1].vencido);
  const maxV=sorted[0]?.[1]?.vencido||1;
  grid.innerHTML=sorted.map(([uf,d])=>`<div class="state-card"><div class="state-code">${escHtml(uf)}</div><div style="font-size:12px;color:#64748b">${d.clientes.size} clientes · ${d.count} parcelas</div><div class="state-total">${fmtBRL(d.vencido)}</div><div class="state-count">Total em aberto: ${fmtBRL(d.total)}</div><div class="state-bar"><div class="state-bar-fill" style="width:${Math.round(d.vencido/maxV*100)}%"></div></div></div>`).join('');
}

// ---------- EXPORT ----------
function exportCSV() {
  const rows=state.filtered.length?state.filtered:state.rows;
  if(!rows.length){alert('Nenhum dado para exportar.');return;}
  const hasFat=state.fatTotal>0;
  const header=['Cód. Cliente','Razão Social','UF','Documento','Dt. Vencimento','Dias Atraso','Faixa','Valor (R$)','Fat. Cliente (R$)','% Fat. Cliente','Status','Observação'];
  const lines=[header.join(';'),...rows.map(r=>{
    const fatC=hasFat?(state.fatMap[r.cliente]||0):'';
    const pct=(hasFat&&fatC>0)?fmtPct(r.valor/fatC*100):'';
    return [r.cliente,r.nome,r.uf,r.ref,fmtDate(r.venc),r.dias,r.faixa.label,r.valor.toFixed(2).replace('.',','),fatC?fatC.toFixed(2).replace('.',','):'',pct,r.status.label,(r.texto||'').replace(/;/g,' ')].join(';');
  })];
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='inadimplencia_'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(a.href);
}

// ---------- NAVEGAÇÃO ----------
const TAB_TITLES = {
  'upload-inadimp':'Upload — Inadimplência','upload-fat':'Upload — Faturamento',
  dashboard:'Dashboard',table:'Lista de Inadimplentes',top:'Top Devedores',map:'Por Estado'
};

function switchTab(id) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === id));
  document.querySelectorAll('.tab-section').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.getElementById('page-title').textContent = TAB_TITLES[id] || '';
  document.getElementById('export-btn').style.display = (id==='table'&&state.rows.length)?'inline-flex':'none';
  if (id==='dashboard')   renderDashboard();
  if (id==='table')       applyFilters();
  if (id==='top')         renderTop();
  if (id==='map')         renderStateView();
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault(); switchTab(el.dataset.tab);
      if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
    });
  });
  document.getElementById('menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('sidebar-close').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));
}

function initApp() {
  setupUpload(); setupNav();
  document.getElementById('last-update').textContent = new Date().toLocaleDateString('pt-BR');
}
