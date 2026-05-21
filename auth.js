/* ============================================================
   SMEE Finance — Sistema de Autenticação por Chave
   ============================================================ */

'use strict';

const AUTH = {
  SESSION_KEY: 'smee_auth',
  SESSION_LABEL: 'smee_label',
  MAX_ATTEMPTS: 5,
  LOCKOUT_MS: 15 * 60 * 1000, // 15 minutos
  LOCKOUT_KEY: 'smee_lockout',
  ATTEMPTS_KEY: 'smee_attempts',

  // Verifica se já tem sessão ativa válida
  isAuthenticated() {
    const stored = sessionStorage.getItem(this.SESSION_KEY);
    return stored === 'ok';
  },

  // Valida a chave digitada
  validate(inputKey) {
    const keys = window.SMEE_KEYS || [];
    const now  = new Date();
    const clean = inputKey.trim().toUpperCase().replace(/\s/g, '');

    const found = keys.find(k => {
      const kClean = k.key.trim().toUpperCase().replace(/\s/g, '');
      if (kClean !== clean) return false;
      if (k.expires) {
        const exp = new Date(k.expires + 'T23:59:59');
        if (now > exp) return false; // expirada
      }
      return true;
    });

    return found || null;
  },

  // Checa bloqueio por tentativas excessivas
  isLockedOut() {
    const lockUntil = localStorage.getItem(this.LOCKOUT_KEY);
    if (!lockUntil) return false;
    if (Date.now() < parseInt(lockUntil)) return true;
    localStorage.removeItem(this.LOCKOUT_KEY);
    localStorage.removeItem(this.ATTEMPTS_KEY);
    return false;
  },

  lockoutRemaining() {
    const lockUntil = parseInt(localStorage.getItem(this.LOCKOUT_KEY) || '0');
    return Math.max(0, Math.ceil((lockUntil - Date.now()) / 60000));
  },

  registerAttempt() {
    const n = parseInt(localStorage.getItem(this.ATTEMPTS_KEY) || '0') + 1;
    localStorage.setItem(this.ATTEMPTS_KEY, n);
    if (n >= this.MAX_ATTEMPTS) {
      localStorage.setItem(this.LOCKOUT_KEY, Date.now() + this.LOCKOUT_MS);
      localStorage.setItem(this.ATTEMPTS_KEY, '0');
    }
    return this.MAX_ATTEMPTS - n;
  },

  resetAttempts() {
    localStorage.removeItem(this.ATTEMPTS_KEY);
    localStorage.removeItem(this.LOCKOUT_KEY);
  },

  login(label) {
    sessionStorage.setItem(this.SESSION_KEY, 'ok');
    sessionStorage.setItem(this.SESSION_LABEL, label || 'Usuário');
    this.resetAttempts();
  },

  logout() {
    sessionStorage.removeItem(this.SESSION_KEY);
    sessionStorage.removeItem(this.SESSION_LABEL);
    location.reload();
  },

  getLabel() {
    return sessionStorage.getItem(this.SESSION_LABEL) || 'Usuário';
  }
};

// ---------- UI de Login ----------

function buildLoginScreen() {
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card" id="auth-card">
      <div class="auth-logo">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="12" fill="#1e40af"/>
          <path d="M10 28L17 14l6 10 4-5.5L35 28" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h1 class="auth-title">SMEE Finance</h1>
      <p class="auth-sub">Controle de Inadimplência</p>
      <p class="auth-desc">Digite sua chave de acesso para continuar.</p>

      <div class="auth-input-wrap" id="auth-input-wrap">
        <input
          type="text"
          id="key-input"
          class="auth-input"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          maxlength="19"
          autocomplete="off"
          spellcheck="false"
          oninput="formatKeyInput(this)"
          onkeydown="if(event.key==='Enter') submitKey()"
          aria-label="Chave de acesso"
        >
        <button class="auth-btn" onclick="submitKey()" id="auth-submit-btn">
          Entrar
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>

      <div class="auth-msg" id="auth-msg"></div>
      <div class="auth-lockout" id="auth-lockout" style="display:none">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        Acesso bloqueado por <span id="lockout-time">15</span> min. Muitas tentativas incorretas.
      </div>

      <p class="auth-footer">
        Para obter sua chave de acesso, entre em contato com o administrador do sistema.
      </p>
    </div>
  `;

  document.body.appendChild(overlay);
  injectAuthStyles();

  // Foca o input
  setTimeout(() => {
    const inp = document.getElementById('key-input');
    if (inp) inp.focus();
  }, 100);

  // Checa lockout inicial
  checkLockoutUI();
}

function formatKeyInput(input) {
  let v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let formatted = '';
  for (let i = 0; i < v.length && i < 16; i++) {
    if (i > 0 && i % 4 === 0) formatted += '-';
    formatted += v[i];
  }
  input.value = formatted;
}

function submitKey() {
  if (AUTH.isLockedOut()) { checkLockoutUI(); return; }

  const input = document.getElementById('key-input');
  const msg   = document.getElementById('auth-msg');
  const btn   = document.getElementById('auth-submit-btn');
  const key   = input.value.trim();

  if (!key) {
    showAuthMsg('Digite sua chave de acesso.', 'warn');
    input.focus();
    return;
  }

  // Animação de verificação
  btn.disabled = true;
  btn.innerHTML = '<span class="auth-spinner"></span> Verificando...';

  setTimeout(() => {
    const found = AUTH.validate(key);

    if (found) {
      btn.innerHTML = '✓ Acesso liberado';
      btn.style.background = '#16a34a';
      showAuthMsg('Bem-vindo(a), ' + found.label + '!', 'success');
      AUTH.login(found.label);

      setTimeout(() => {
        document.getElementById('auth-overlay').remove();
        initApp();
      }, 800);

    } else {
      const remaining = AUTH.registerAttempt();
      btn.disabled = false;
      btn.innerHTML = 'Entrar <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

      if (AUTH.isLockedOut()) {
        checkLockoutUI();
      } else {
        const extra = remaining > 0 ? ` (${remaining} tentativa${remaining>1?'s':''} restante${remaining>1?'s':''})` : '';
        showAuthMsg('Chave inválida ou expirada.' + extra, 'error');
        input.value = '';
        input.focus();
        document.getElementById('auth-card').classList.add('shake');
        setTimeout(() => document.getElementById('auth-card').classList.remove('shake'), 500);
      }
    }
  }, 600);
}

function showAuthMsg(text, type) {
  const el = document.getElementById('auth-msg');
  el.textContent = text;
  el.className = 'auth-msg auth-msg-' + type;
}

function checkLockoutUI() {
  if (AUTH.isLockedOut()) {
    document.getElementById('auth-input-wrap').style.display = 'none';
    document.getElementById('auth-lockout').style.display = 'flex';
    document.getElementById('lockout-time').textContent = AUTH.lockoutRemaining();
    // Atualiza contagem regressiva
    const interval = setInterval(() => {
      if (!AUTH.isLockedOut()) {
        clearInterval(interval);
        document.getElementById('auth-input-wrap').style.display = 'flex';
        document.getElementById('auth-lockout').style.display = 'none';
        document.getElementById('key-input').focus();
      } else {
        document.getElementById('lockout-time').textContent = AUTH.lockoutRemaining();
      }
    }, 10000);
  }
}

function injectAuthStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #auth-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .auth-card {
      background: #ffffff; border-radius: 16px;
      padding: 40px 36px; width: 100%; max-width: 420px;
      text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,.35);
      animation: authFadeIn .4s ease;
    }
    @keyframes authFadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:none; } }
    .auth-card.shake { animation: authShake .4s ease; }
    @keyframes authShake {
      0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)}
      40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)}
    }
    .auth-logo { margin-bottom: 14px; }
    .auth-title { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .auth-sub { font-size: 13px; color: #1e40af; font-weight: 600; margin-bottom: 20px; letter-spacing: .03em; text-transform: uppercase; }
    .auth-desc { font-size: 14px; color: #64748b; margin-bottom: 24px; line-height: 1.5; }
    .auth-input-wrap { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
    .auth-input {
      width: 100%; height: 48px; border: 1.5px solid #e2e8f0; border-radius: 10px;
      font-size: 17px; font-weight: 600; text-align: center; letter-spacing: .12em;
      font-family: monospace; color: #0f172a; outline: none;
      transition: border-color .2s;
      background: #f8fafc;
    }
    .auth-input:focus { border-color: #1e40af; background: #fff; box-shadow: 0 0 0 3px #dbeafe; }
    .auth-input::placeholder { color: #cbd5e1; letter-spacing: .08em; font-weight: 400; font-size: 15px; }
    .auth-btn {
      width: 100%; height: 48px; border: none; border-radius: 10px;
      background: #1e40af; color: white; font-size: 15px; font-weight: 600;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: background .15s, opacity .15s;
    }
    .auth-btn:hover { background: #1d3a9e; }
    .auth-btn:disabled { opacity: .7; cursor: not-allowed; }
    .auth-spinner {
      width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3);
      border-top-color: white; border-radius: 50%;
      animation: spin .7s linear infinite; display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .auth-msg { font-size: 13px; min-height: 20px; margin-bottom: 8px; font-weight: 500; }
    .auth-msg-error { color: #dc2626; }
    .auth-msg-warn  { color: #d97706; }
    .auth-msg-success { color: #16a34a; }
    .auth-lockout {
      display: flex; align-items: center; gap: 8px; justify-content: center;
      font-size: 13px; color: #dc2626; background: #fef2f2;
      border: 1px solid #fecaca; border-radius: 8px;
      padding: 10px 14px; margin-bottom: 12px; font-weight: 500;
    }
    .auth-footer { font-size: 12px; color: #94a3b8; margin-top: 20px; line-height: 1.5; }
  `;
  document.head.appendChild(style);
}

// Adiciona botão de logout na topbar
function addLogoutButton() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;

  const label = AUTH.getLabel();
  const userEl = document.createElement('div');
  userEl.className = 'user-pill';
  userEl.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    <span>${escHtml(label)}</span>
    <button class="logout-btn" onclick="AUTH.logout()" title="Sair">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>
  `;
  actions.prepend(userEl);

  // Estilo do user pill
  const style = document.createElement('style');
  style.textContent = `
    .user-pill {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; font-weight: 500; color: #475569;
      background: #f1f5f9; border: 1px solid #e2e8f0;
      border-radius: 20px; padding: 4px 10px 4px 8px;
    }
    .logout-btn {
      background: none; border: none; cursor: pointer;
      color: #94a3b8; padding: 2px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: color .15s;
    }
    .logout-btn:hover { color: #dc2626; }
  `;
  document.head.appendChild(style);
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Ponto de entrada — chamado pelo index.html
function initAuth() {
  if (AUTH.isAuthenticated()) {
    initApp();
    addLogoutButton();
  } else {
    buildLoginScreen();
  }
}
