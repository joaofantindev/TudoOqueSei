/* =========================================================
   learn.log — SQLite no navegador + login por hash
   ========================================================= */

const AUTH_KEY = 'learn.log:auth:v1';
const USER_KEY = 'learn.log:user:v1';
const DRAFT_KEY = 'learn.log:sqlite-draft:v1';
const DB_FILE = 'data/learn.sqlite';

/* SHA-256 do par usuário:senha — as credenciais não ficam em texto plano.
   Lembrete: em um site estático isso é uma barreira de interface, não
   autenticação de servidor — o hash pode ser inspecionado no devtools. */
const CREDENTIALS_HASH = '00f164c14725749945dedca6ba41ea9e9ece24ae5cb0aaf2c9de3bf6041d0236';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const LANG_EXT = {
  javascript: 'js',
  typescript: 'ts',
  react: 'jsx',
  css: 'css',
  html: 'html',
  python: 'py',
  sql: 'sql',
  shell: 'sh',
  outro: 'md'
};
const PRESET_COLORS = ['#efb041', '#ee8079', '#73b78e', '#86a7d8', '#b79be0', '#e8a87c', '#7f9cf5', '#c9b26b'];

const els = {
  search: document.getElementById('search-input'),
  sort: document.getElementById('sort-select'),
  tagbar: document.getElementById('tagbar'),
  grid: document.getElementById('notes-grid'),
  empty: document.getElementById('empty-state'),
  resultCount: document.getElementById('result-count'),
  dirtyPill: document.getElementById('dirty-pill'),
  dbState: document.getElementById('db-state'),
  statNotes: document.getElementById('stat-notes'),
  statTags: document.getElementById('stat-tags'),
  statLines: document.getElementById('stat-lines'),
  noteModal: document.getElementById('note-modal'),
  noteFile: document.getElementById('note-file'),
  noteContent: document.getElementById('note-content'),
  formModal: document.getElementById('form-modal'),
  form: document.getElementById('note-form'),
  formEyebrow: document.getElementById('form-eyebrow'),
  formTitle: document.getElementById('form-title'),
  formCrumb: document.getElementById('form-crumb'),
  formSubmit: document.getElementById('form-submit'),
  fTitle: document.getElementById('f-title'),
  fLang: document.getElementById('f-lang'),
  fTag: document.getElementById('f-tag'),
  fConcepts: document.getElementById('f-concepts'),
  fExplanation: document.getElementById('f-explanation'),
  fCode: document.getElementById('f-code'),
  tagsModal: document.getElementById('tags-modal'),
  tagList: document.getElementById('tag-list'),
  tagTotal: document.getElementById('tag-total'),
  tagForm: document.getElementById('tag-form'),
  tagName: document.getElementById('tag-name-input'),
  tagColor: document.getElementById('tag-color-input'),
  tagColorWrap: document.getElementById('tag-color-wrap'),
  tagPresets: document.getElementById('tag-presets'),
  publishStatus: document.getElementById('publish-status'),
  discardBtn: document.querySelector('[data-discard-db]'),
  loginModal: document.getElementById('login-modal'),
  loginForm: document.getElementById('login-form'),
  loginUser: document.getElementById('login-user'),
  loginPass: document.getElementById('login-pass'),
  loginError: document.getElementById('login-error'),
  confirmModal: document.getElementById('confirm-modal'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmText: document.getElementById('confirm-text'),
  userLabel: document.getElementById('user-label'),
  modeBadge: document.getElementById('mode-badge'),
  toast: document.getElementById('toast')
};

const state = {
  tags: [],
  notes: [],
  query: '',
  tagSlug: 'all',
  sort: 'recent',
  editingId: null,
  dirty: false
};

let SQL = null;
let db = null;

/* O usuário pediu literalmente este nome de variável: true = logado. */
let loginCredenciaisHash = false;
try {
  loginCredenciaisHash = sessionStorage.getItem(AUTH_KEY) === '1';
} catch {
  /* armazenamento indisponível */
}
window.loginCredenciaisHash = loginCredenciaisHash;

let lastFocus = null;
let toastTimer = 0;
let searchTimer = 0;

/* ---------- helpers ---------- */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugify(value) {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function safeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#ee8079';
}

function inkFor(color) {
  const hex = safeColor(color).slice(1);
  const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.32 ? '#121210' : '#f6f2ea';
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  const date = new Date(String(iso) + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return String(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'hoje';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function readingMinutes(note) {
  const words = `${note.explanation || ''} ${(note.concepts || []).join(' ')}`
    .split(/\s+/)
    .filter(Boolean).length;
  const codeLines = note.code ? note.code.split('\n').length : 0;
  return Math.max(2, Math.round(words / 130 + codeLines / 18));
}

function excerptOf(note) {
  const firstBlock = String(note.explanation || '').split(/\n{2,}/)[0] || '';
  const clean = firstBlock.replace(/[`*]/g, '').replace(/^[-#]+\s+/, '').replace(/\s+/g, ' ').trim();
  return clean.length > 150 ? `${clean.slice(0, 147).trimEnd()}…` : clean;
}

function tagOf(name) {
  const slug = slugify(name);
  return state.tags.find((tag) => slugify(tag.name) === slug) || null;
}

function tagLabel(name) {
  return tagOf(name)?.name || String(name || '');
}

function tagColor(name) {
  return safeColor(tagOf(name)?.color || '#ee8079');
}

function canEdit() {
  return loginCredenciaisHash === true;
}

function requireEdit() {
  if (canEdit()) return true;
  toast('Entre para editar');
  return false;
}

/* ---------- auth ---------- */

async function sha256Hex(text) {
  if (!window.crypto || !window.crypto.subtle) throw new Error('crypto.subtle indisponível');
  const data = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function setAuth(value) {
  loginCredenciaisHash = value;
  window.loginCredenciaisHash = value;
  try {
    if (value) sessionStorage.setItem(AUTH_KEY, '1');
    else sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

function storedUser() {
  try {
    return sessionStorage.getItem(USER_KEY) || '';
  } catch {
    return '';
  }
}

function applyAuth() {
  document.body.classList.toggle('read-only', !loginCredenciaisHash);
  document.body.classList.toggle('is-authed', loginCredenciaisHash);
  els.userLabel.textContent = loginCredenciaisHash ? (storedUser() || 'autor') : 'autor';
  els.modeBadge.textContent = loginCredenciaisHash ? 'logado · edição ativa' : 'somente leitura';
  els.modeBadge.classList.toggle('is-editor', loginCredenciaisHash);
  renderDirty();
}

function openLogin() {
  if (loginCredenciaisHash) {
    toast('Você já está logado');
    return;
  }
  els.loginError.hidden = true;
  els.loginUser.classList.remove('is-invalid');
  els.loginPass.classList.remove('is-invalid');
  els.loginPass.value = '';
  openLayer(els.loginModal, els.loginUser);
}

async function submitLogin(event) {
  event.preventDefault();
  if (loginCredenciaisHash) return;

  const user = els.loginUser.value.trim();
  const pass = els.loginPass.value;
  els.loginError.hidden = true;
  els.loginUser.classList.remove('is-invalid');
  els.loginPass.classList.remove('is-invalid');

  if (!user || !pass) {
    els.loginError.textContent = 'preencha usuário e senha';
    els.loginError.hidden = false;
    (user ? els.loginPass : els.loginUser).focus();
    return;
  }

  let digest = '';
  try {
    digest = await sha256Hex(`${user}:${pass}`);
  } catch {
    toast('Login exige HTTPS ou localhost');
    return;
  }

  if (digest !== CREDENTIALS_HASH) {
    els.loginError.textContent = 'usuário ou senha incorretos';
    els.loginError.hidden = false;
    els.loginUser.classList.add('is-invalid');
    els.loginPass.classList.add('is-invalid');
    els.loginPass.value = '';
    els.loginPass.focus();
    return;
  }

  setAuth(true);
  try {
    sessionStorage.setItem(USER_KEY, user);
  } catch {
    /* armazenamento indisponível */
  }
  els.loginForm.reset();
  els.loginError.hidden = true;
  applyAuth();

  const restored = await restoreDraft();
  if (!restored) render();
  closeLayer(els.loginModal);
  toast(restored ? 'Logado — rascunho restaurado' : 'Logado — edição liberada');
}

async function logout() {
  if (!loginCredenciaisHash) return;

  let saved = false;

  if (state.dirty) {
    const save = await askConfirm(
      'Salvar modificações?',
      'As notas e tags alteradas neste navegador serão gravadas em data/learn.sqlite. Se sair sem salvar, o rascunho continua aqui e volta no próximo login.'
    );

    if (save === null) return;

    if (save) {
      const result = await syncDraftToServer();
      if (!result.ok) {
        console.error('falha ao salvar no SQLite:', result.message);
        toast('Não foi possível salvar no SQLite — rascunho mantido');
        return;
      }
      clearDraft();
      state.dirty = false;
      saved = true;
    }
  }

  setAuth(false);
  try {
    sessionStorage.removeItem(USER_KEY);
  } catch {
    /* armazenamento indisponível */
  }

  const hadDraft = Boolean(loadDraftBytes());
  state.editingId = null;
  document.querySelectorAll('.modal-layer:not([hidden])').forEach((layer) => closeLayer(layer));

  try {
    const fresh = await openPublicDb();
    if (db) db.close();
    db = fresh;
    state.dirty = false;
    readData();
  } catch (error) {
    console.error('não foi possível recarregar o banco publicado', error);
    toast('Não foi possível recarregar o banco publicado');
  }

  applyAuth();
  render();

  if (saved) toast('Modificações salvas no SQLite — sessão encerrada');
  else if (hadDraft) toast('Sessão encerrada — rascunho mantido neste navegador');
  else toast('Sessão encerrada');
}

/* ---------- sqlite ---------- */

function setDbState(status, message = '') {
  if (!els.dbState) return;

  if (status === 'ready') {
    els.dbState.hidden = true;
    els.dbState.innerHTML = '';
    return;
  }

  els.dbState.hidden = false;
  els.dbState.dataset.state = status;

  if (status === 'loading') {
    els.dbState.innerHTML = '<span class="db-spinner" aria-hidden="true"></span><span>carregando <code>data/learn.sqlite</code>…</span>';
    return;
  }

  els.dbState.innerHTML = `<span class="db-icon" aria-hidden="true">!</span>
    <span>${esc(message || 'não foi possível carregar data/learn.sqlite')}</span>
    <button class="btn btn-ghost btn-sm" type="button" data-retry>tentar de novo</button>`;
}

function base64ToBytes(raw) {
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function loadDraftBytes() {
  let raw = null;
  try {
    raw = localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    return base64ToBytes(raw);
  } catch {
    clearDraft();
    return null;
  }
}

function saveDraft() {
  if (!canEdit() || !db) return;

  try {
    localStorage.setItem(DRAFT_KEY, bytesToBase64(db.export()));
  } catch (error) {
    console.warn('não foi possível salvar o rascunho local', error);
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

async function openPublicDb() {
  const url = new URL(DB_FILE, location.href);
  url.searchParams.set('v', String(Date.now()));
  const response = await fetch(url.href, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  return new SQL.Database(bytes);
}

async function restoreDraft() {
  if (!SQL) return false;

  const bytes = loadDraftBytes();
  if (!bytes) return false;

  let draft = null;
  try {
    draft = new SQL.Database(bytes);
    const check = draft.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes'");
    if (!check.length) {
      draft.close();
      clearDraft();
      return false;
    }

    if (db) db.close();
    db = draft;
    state.dirty = true;
    readData();
    render();
    renderDirty();
    return true;
  } catch (error) {
    console.error('rascunho local inválido', error);
    if (draft) draft.close();
    clearDraft();
    return false;
  }
}

function hasColumn(database, table, column) {
  try {
    const result = database.exec(`PRAGMA table_info(${table})`);
    return Boolean(result.length) && result[0].values.some((row) => row[1] === column);
  } catch {
    return false;
  }
}

function snapshotTags(database) {
  if (!database) return [];
  const uidColumn = hasColumn(database, 'tags', 'uid') ? 'uid' : 'NULL AS uid';
  const result = database.exec(
    `SELECT id, slug, name, color, ${uidColumn}, created_at
     FROM tags ORDER BY name COLLATE NOCASE`
  );
  if (!result.length) return [];

  return result[0].values.map(([id, slug, name, color, uid, createdAt]) => ({
    id: Number(id),
    uid: String(uid || `tag-${slug}`),
    slug: String(slug),
    name: String(name),
    color: safeColor(color),
    createdAt: String(createdAt || today())
  }));
}

function snapshotNotes(database) {
  if (!database) return [];
  const uidColumn = hasColumn(database, 'notes', 'uid') ? 'n.uid' : 'NULL';
  const tagUidColumn = hasColumn(database, 'notes', 'tag_uid') ? 'n.tag_uid' : 'NULL';
  const result = database.exec(
    `SELECT n.id, ${uidColumn} AS uid, ${tagUidColumn} AS tag_uid,
            n.title, n.tag_id, t.slug AS tag_slug, t.name AS tag_name, t.color AS tag_color,
            t.created_at AS tag_created, n.lang, n.file, n.explanation, n.code, n.concepts,
            n.created_at, n.updated_at
     FROM notes n
     JOIN tags t ON t.id = n.tag_id
     ORDER BY n.id`
  );
  if (!result.length) return [];

  return result[0].values.map((row) => {
    let concepts = [];
    try {
      const parsed = JSON.parse(row[13]);
      if (Array.isArray(parsed)) concepts = parsed.filter((item) => typeof item === 'string');
    } catch {
      concepts = [];
    }

    const tagSlug = String(row[5] || '');

    return {
      id: Number(row[0]),
      uid: String(row[1] || `note-${row[0]}`),
      tagUid: String(row[2] || `tag-${tagSlug}`),
      title: String(row[3] || ''),
      tagId: Number(row[4]),
      tagSlug,
      tag: String(row[6] || ''),
      tagColor: safeColor(row[7]),
      tagCreatedAt: String(row[8] || today()),
      lang: String(row[9] || ''),
      file: String(row[10] || ''),
      explanation: String(row[11] || ''),
      code: String(row[12] || ''),
      concepts,
      createdAt: String(row[14] || today()),
      updatedAt: String(row[15] || row[14] || today())
    };
  });
}

function readTags() {
  return snapshotTags(db);
}

function readNotes() {
  return snapshotNotes(db);
}

function readData() {
  state.tags = readTags();
  state.notes = readNotes();
}

function commitChanges() {
  state.dirty = true;
  saveDraft();
  readData();
  render();
}

/* ---------- persistir no SQLite do servidor ---------- */

function operationId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function noteSignature(note) {
  return JSON.stringify([
    note.title,
    note.tagSlug,
    note.lang,
    note.file,
    note.explanation,
    note.code,
    note.concepts
  ]);
}

function buildSyncOperations(working, published) {
  const ops = [];
  const at = new Date().toISOString();

  const publishedTags = new Map(published.tags.map((tag) => [tag.uid, tag]));

  for (const tag of working.tags) {
    const previous = publishedTags.get(tag.uid);
    const changed = !previous
      || previous.slug !== tag.slug
      || previous.name !== tag.name
      || previous.color !== tag.color;

    if (!changed) continue;

    ops.push({
      id: operationId(),
      type: previous ? 'tag.update' : 'tag.create',
      payload: {
        uid: tag.uid,
        slug: tag.slug,
        name: tag.name,
        color: tag.color,
        createdAt: tag.createdAt
      },
      at
    });
  }

  const publishedNotes = new Map(published.notes.map((note) => [note.uid, note]));
  const workingUids = new Set();

  for (const note of working.notes) {
    workingUids.add(note.uid);
    const previous = publishedNotes.get(note.uid);
    if (previous && noteSignature(previous) === noteSignature(note)) continue;

    ops.push({
      id: operationId(),
      type: previous ? 'note.update' : 'note.create',
      payload: {
        uid: note.uid,
        title: note.title,
        tagUid: note.tagUid,
        tag: {
          uid: note.tagUid,
          slug: note.tagSlug,
          name: note.tag,
          color: note.tagColor,
          createdAt: note.tagCreatedAt
        },
        lang: note.lang,
        file: note.file,
        explanation: note.explanation,
        code: note.code,
        concepts: note.concepts,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      },
      at
    });
  }

  for (const note of published.notes) {
    if (workingUids.has(note.uid)) continue;
    ops.push({
      id: operationId(),
      type: 'note.delete',
      payload: { uid: note.uid },
      at
    });
  }

  return ops;
}

async function syncDraftToServer() {
  if (!db) return { ok: false, message: 'banco local indisponível' };

  let published = null;
  try {
    published = await openPublicDb();
    const ops = buildSyncOperations(
      { tags: snapshotTags(db), notes: snapshotNotes(db) },
      { tags: snapshotTags(published), notes: snapshotNotes(published) }
    );

    if (!ops.length) return { ok: true, applied: 0 };

    const response = await fetch('api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops })
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data || data.ok !== true) {
      return {
        ok: false,
        message: (data && data.error) || `servidor respondeu ${response.status}`
      };
    }

    return { ok: true, applied: Number(data.applied) || 0 };
  } catch (error) {
    console.error('não foi possível salvar no SQLite do servidor', error);
    return { ok: false, message: error.message || 'erro de rede' };
  } finally {
    if (published) {
      try {
        published.close();
      } catch {
        /* já fechado */
      }
    }
  }
}

async function boot() {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignora */
    }
    db = null;
  }

  setDbState('loading');
  els.resultCount.textContent = 'carregando…';

  try {
    if (!SQL) {
      SQL = await initSqlJs({ locateFile: (file) => `vendor/${file}` });
    }
    db = await openPublicDb();
    readData();
    applyAuth();
    render();
    setDbState('ready');

    if (canEdit()) {
      const restored = await restoreDraft();
      if (restored) toast('Rascunho local restaurado');
    }
  } catch (error) {
    console.error('falha ao iniciar o banco', error);
    setDbState('error');
    els.resultCount.textContent = 'banco indisponível';
    els.grid.innerHTML = '';
    els.empty.hidden = false;
    els.empty.innerHTML = `<div class="empty-inner">
        <span class="empty-badge">!</span>
        <h3>Banco não carregado</h3>
        <p>Confira se <code>data/learn.sqlite</code> foi publicado junto com a página.</p>
      </div>`;
  }
}

/* ---------- accent ---------- */

function applyAccent(color) {
  const accent = safeColor(color);
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-ink', inkFor(accent));
}

function syncAccent() {
  const active = state.tagSlug !== 'all'
    ? state.tags.find((tag) => slugify(tag.name) === state.tagSlug)
    : null;
  const latest = [...state.notes].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id
  )[0];
  const color = active?.color
    || (latest ? tagColor(latest.tag) : '')
    || state.tags[0]?.color
    || '#ee8079';
  applyAccent(color);
}

/* ---------- syntax highlight ---------- */

const TOKEN_RE = /(#[0-9a-fA-F]{3,8}\b)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|delete|void|yield|await|async|import|export|from|default|try|catch|finally|throw|null|undefined|true|false|interface|type|enum|implements|public|private|protected|readonly|as|of|in|def|elif|lambda|pass|none|true|false|print|and|or|not|is|with|select|from|where|left|right|inner|outer|join|on|group|order|by|having|limit|insert|into|values|update|set|delete|create|table|count|sum|pick|squash|reword|drop)\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z-]+)(?=\s*:)|(\b\d+(?:\.\d+)?\b)/gi;

function highlightLine(line) {
  let output = '';
  let lastIndex = 0;

  line.replace(TOKEN_RE, (match, hex, comment, string, keyword, fn, prop, number, offset) => {
    output += esc(line.slice(lastIndex, offset));
    const className = hex || number
      ? 'tok-num'
      : comment
        ? 'tok-comment'
        : string
          ? 'tok-str'
          : keyword
            ? 'tok-kw'
            : fn
              ? 'tok-fn'
              : prop
                ? 'tok-prop'
                : 'tok-num';
    output += `<span class="${className}">${esc(match)}</span>`;
    lastIndex = offset + match.length;
    return match;
  });

  output += esc(line.slice(lastIndex));
  return output;
}

function codeLineHtml(line, lineNumber) {
  return `<div class="code-line"><span class="ln" aria-hidden="true">${lineNumber}</span><span class="lc">${highlightLine(line) || '&nbsp;'}</span></div>`;
}

const COPY_ICON = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor"/><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5H5" stroke="currentColor"/></svg>';
const ARROW_ICON = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function codeWindowHtml(code, file, options = {}) {
  const lines = String(code || '').replace(/\n$/, '').split('\n');
  const visible = options.preview ? lines.slice(0, 9) : lines;
  const copyButton = options.copy
    ? `<button class="copy-btn" type="button" data-copy>${COPY_ICON}copiar</button>`
    : '';

  return `<div class="code-window${options.preview ? ' is-preview' : ''}">
    <div class="code-head">
      <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="code-file">${esc(file || 'snippet.txt')}</span>
      <span class="spacer"></span>${copyButton}
    </div>
    <div class="code-body">${visible.map((line, index) => codeLineHtml(line, index + 1)).join('')}</div>
  </div>`;
}

/* ---------- rendering ---------- */

function tagChip(note, interactive) {
  const color = tagColor(note.tag);
  const element = interactive ? 'button' : 'span';
  const attrs = interactive ? ` type="button" data-tag-slug="${esc(slugify(note.tag))}"` : '';
  return `<${element} class="chip chip-tag"${attrs} style="--tag:${color}"><i class="dot" style="--dot:${color}"></i>${esc(tagLabel(note.tag))}</${element}>`;
}

function cardHtml(note, index) {
  const color = tagColor(note.tag);
  const preview = note.code ? codeWindowHtml(note.code, note.file, { preview: true }) : '';

  return `<article class="note-card" tabindex="0" role="button" data-id="${note.id}" style="--i:${Math.min(index, 10)};--tag:${color};--tag-ink:${inkFor(color)}" aria-label="Abrir nota: ${esc(note.title)}">
    <div class="card-top">
      <div class="chip-row">${tagChip(note, false)}</div>
      <span class="card-open">${ARROW_ICON}</span>
    </div>
    <h3>${esc(note.title)}</h3>
    <p class="excerpt">${esc(excerptOf(note))}</p>
    ${preview}
    <div class="card-foot">
      <time datetime="${esc(note.createdAt)}">${esc(formatDate(note.createdAt))}</time>
      <span aria-hidden="true">·</span>
      <span>${readingMinutes(note)} min de leitura</span>
      <span class="spacer"></span>
      <span class="card-lang">${esc(note.lang || 'nota')}</span>
    </div>
  </article>`;
}

function inlineMd(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function proseHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length && lines.every((line) => line.startsWith('- '))) {
        return `<ul>${lines.map((line) => `<li>${inlineMd(line.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${inlineMd(block.replace(/\n/g, ' '))}</p>`;
    })
    .join('');
}

function noteModalHtml(note) {
  const code = note.code ? codeWindowHtml(note.code, note.file, { copy: true }) : '';
  const concepts = note.concepts.length
    ? `<div class="concepts">
        <span class="label">conceitos-chave</span>
        <div class="chip-row">${note.concepts.map((item) => `<span class="chip">${esc(item)}</span>`).join('')}</div>
      </div>`
    : '';
  const actions = canEdit()
    ? `<div class="note-actions">
        <div class="note-actions-group">
          <button class="btn btn-ghost btn-sm" type="button" data-edit="${note.id}">editar nota</button>
          <button class="btn btn-danger-ghost" type="button" data-delete="${note.id}">excluir nota</button>
        </div>
        <button class="btn btn-ghost" type="button" data-close>fechar</button>
      </div>`
    : `<div class="note-actions is-readonly">
        <button class="btn btn-ghost" type="button" data-close>fechar</button>
      </div>`;

  return `<div class="note-head">
      <div class="chip-row">${tagChip(note, true)}</div>
      <h2 id="note-title">${esc(note.title)}</h2>
      <div class="note-meta">
        <span>${esc(formatDate(note.createdAt))}</span>
        <span aria-hidden="true">·</span>
        <span>${readingMinutes(note)} min de leitura</span>
        <span aria-hidden="true">·</span>
        <span class="path">~/notes/${esc(note.file)}</span>
      </div>
    </div>
    <div class="note-body">
      <div class="prose">${proseHtml(note.explanation)}</div>
      ${code}
      ${concepts}
      ${actions}
    </div>`;
}

function getFiltered() {
  const terms = fold(state.query).trim().split(/\s+/).filter(Boolean);

  const filtered = state.notes.filter((note) => {
    if (state.tagSlug !== 'all' && slugify(note.tag) !== state.tagSlug) return false;
    if (!terms.length) return true;

    const haystack = fold(
      `${note.title} ${tagLabel(note.tag)} ${note.lang} ${note.file} ${note.explanation} ${note.concepts.join(' ')} ${note.code}`
    );
    return terms.every((term) => haystack.includes(term));
  });

  if (state.sort === 'oldest') {
    filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  } else if (state.sort === 'az') {
    filtered.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  } else {
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  }

  return filtered;
}

function tagCounts() {
  const counts = new Map();
  for (const note of state.notes) {
    const slug = slugify(note.tag);
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  return counts;
}

function renderTagbar() {
  const counts = tagCounts();
  const usedTags = state.tags.filter((tag) => (counts.get(slugify(tag.name)) || 0) > 0);
  const scrollLeft = els.tagbar.scrollLeft;

  const allChip = `<button class="chip chip-filter${state.tagSlug === 'all' ? ' is-active' : ''}" type="button" data-tag-slug="all">
      <i class="dot" style="--dot:var(--muted)"></i>todos
      <span class="chip-count">${state.notes.length}</span>
    </button>`;

  const chips = usedTags.map((tag) => {
    const slug = slugify(tag.name);
    const active = state.tagSlug === slug;
    const color = safeColor(tag.color);
    const style = active ? ` style="--tag:${color};--tag-ink:${inkFor(color)}"` : '';
    return `<button class="chip chip-filter${active ? ' is-active' : ''}" type="button" data-tag-slug="${esc(slug)}"${style}>
        <i class="dot" style="--dot:${color}"></i>${esc(tag.name)}
        <span class="chip-count">${counts.get(slug) || 0}</span>
      </button>`;
  }).join('');

  els.tagbar.innerHTML = allChip + chips;
  els.tagbar.scrollLeft = scrollLeft;
}

function renderEmpty(filtered) {
  const hasFilters = Boolean(state.query.trim()) || state.tagSlug !== 'all';

  if (!state.notes.length) {
    els.empty.innerHTML = `<div class="empty-inner">
        <span class="empty-badge">{ }</span>
        <h3>Nenhuma nota ainda</h3>
        <p>${canEdit()
          ? 'Adicione a primeira nota e baixe o learn.sqlite atualizado para commitar.'
          : 'O autor ainda não publicou nenhuma nota por aqui.'}</p>
        ${canEdit() ? '<div class="empty-actions"><button class="btn btn-primary btn-sm" type="button" data-open-form>+ Nova nota</button></div>' : ''}
      </div>`;
  } else if (hasFilters && filtered.length === 0) {
    els.empty.innerHTML = `<div class="empty-inner">
        <span class="empty-badge">?</span>
        <h3>Nenhuma nota encontrada</h3>
        <p>Tente outro termo ou remova o filtro de assunto ativo.</p>
        <button class="btn btn-ghost btn-sm" type="button" data-clear>Limpar filtros</button>
      </div>`;
  } else {
    els.empty.innerHTML = '';
  }

  els.empty.hidden = filtered.length !== 0;
}

function renderGrid() {
  const filtered = getFiltered();

  els.grid.innerHTML = filtered.map(cardHtml).join('');
  renderEmpty(filtered);

  const filteredActive = Boolean(state.query.trim()) || state.tagSlug !== 'all';
  els.resultCount.textContent = filteredActive
    ? `${filtered.length} de ${state.notes.length} notas`
    : `${state.notes.length} ${state.notes.length === 1 ? 'nota' : 'notas'}`;
}

function renderStats() {
  let lines = 0;
  for (const note of state.notes) {
    lines += note.code ? note.code.split('\n').length : 0;
  }

  els.statNotes.textContent = new Intl.NumberFormat('pt-BR').format(state.notes.length);
  els.statTags.textContent = new Intl.NumberFormat('pt-BR').format(state.tags.length);
  els.statLines.textContent = new Intl.NumberFormat('pt-BR').format(lines);
}

function renderDirty() {
  const dirty = canEdit() && state.dirty;
  els.dirtyPill.hidden = !dirty;
  if (els.discardBtn) els.discardBtn.hidden = !dirty;
  els.publishStatus.classList.toggle('is-draft', dirty);
  els.publishStatus.innerHTML = dirty
    ? '<i class="draft-dot" aria-hidden="true"></i> rascunho local — baixe o learn.sqlite'
    : '<i class="draft-dot" aria-hidden="true"></i> conteúdo publicado · data/learn.sqlite';
}

function render() {
  renderTagbar();
  renderGrid();
  renderStats();
  syncAccent();
  renderDirty();
}

/* ---------- tags manager ---------- */

function renderPresets() {
  els.tagPresets.innerHTML = PRESET_COLORS.map((color) => (
    `<button type="button" class="swatch" style="--tag:${color}" data-preset-color="${color}" title="Usar ${color}" aria-label="Usar a cor ${color}"></button>`
  )).join('');
}

function renderTagsModal() {
  const rows = state.tags.map((tag) => {
    const color = safeColor(tag.color);
    const count = state.notes.filter((note) => slugify(note.tag) === slugify(tag.name)).length;
    return `<div class="tag-row" style="--tag:${color}">
      <label class="tag-swatch" style="--tag:${color}" title="Mudar a cor de ${esc(tag.name)}">
        <input type="color" value="${color}" data-tag-id="${tag.id}" aria-label="Cor da tag ${esc(tag.name)}">
      </label>
      <div class="tag-row-main">
        <span class="tag-row-name">${esc(tag.name)}</span>
        <span class="tag-row-meta">#${esc(slugify(tag.name))} · ${count} ${count === 1 ? 'nota' : 'notas'}</span>
      </div>
      <span class="tag-row-hex">${color.toUpperCase()}</span>
    </div>`;
  }).join('');

  els.tagTotal.textContent = `${state.tags.length} ${state.tags.length === 1 ? 'tag' : 'tags'}`;
  els.tagList.innerHTML = rows || '<p class="tag-empty">Nenhuma tag ainda. Crie a primeira acima.</p>';
  renderDirty();
}

function renderTagOptions(selectedTag = '') {
  els.fTag.innerHTML = state.tags
    .map((tag) => `<option value="${tag.id}">${esc(tag.name)}</option>`)
    .join('');

  const match = state.tags.find((tag) => slugify(tag.name) === (slugify(selectedTag) || state.tagSlug));
  if (match) els.fTag.value = String(match.id);
}

function updateTagColor(id, value) {
  if (!requireEdit()) return;
  const tag = state.tags.find((item) => item.id === id);
  if (!tag) return;
  const color = safeColor(value);
  if (color === safeColor(tag.color)) return;

  try {
    db.run('UPDATE tags SET color = ? WHERE id = ?', [color, id]);
  } catch (error) {
    console.error(error);
    toast('Não foi possível atualizar a cor');
    return;
  }

  commitChanges();
  renderTagsModal();
  toast(`Cor de "${tag.name}" atualizada`);
}

/* ---------- publish ---------- */

function downloadDb() {
  if (!requireEdit()) return;

  try {
    const bytes = db.export();
    const blob = new Blob([bytes], { type: 'application/vnd.sqlite3' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'learn.sqlite';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);

    state.dirty = false;
    clearDraft();
    renderDirty();
    if (!els.tagsModal.hidden) renderTagsModal();
    toast('learn.sqlite baixado — substitua em data/ e commite');
  } catch (error) {
    console.error(error);
    toast('Não foi possível gerar o learn.sqlite');
  }
}

async function discardDraft() {
  if (!requireEdit()) return;

  clearDraft();
  state.dirty = false;
  state.editingId = null;

  try {
    const fresh = await openPublicDb();
    if (db) db.close();
    db = fresh;
    readData();
  } catch (error) {
    console.error('não foi possível recarregar o banco publicado', error);
    toast('Não foi possível recarregar o banco publicado');
    return;
  }

  render();
  renderTagsModal();
  const button = els.discardBtn;
  if (button) {
    button.dataset.armed = '0';
    button.classList.remove('is-armed');
    button.textContent = 'descartar rascunho';
  }
  toast('Rascunho descartado — voltou ao conteúdo publicado');
}

/* ---------- modals ---------- */

function openLayer(layer, focusEl) {
  lastFocus = document.activeElement;
  layer.hidden = false;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => layer.classList.add('is-open'));
  if (focusEl) {
    window.setTimeout(() => focusEl.focus({ preventScroll: true }), 90);
  }
}

function closeLayer(layer) {
  layer.classList.remove('is-open');
  layer.hidden = true;
  if (!document.querySelector('.modal-layer:not([hidden])')) {
    document.body.classList.remove('no-scroll');
  }
  if (lastFocus && document.contains(lastFocus)) {
    lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }
}

let confirmResolve = null;

function askConfirm(title, text) {
  if (confirmResolve) settleConfirm(null);

  els.confirmTitle.textContent = title;
  els.confirmText.textContent = text;

  return new Promise((resolve) => {
    confirmResolve = resolve;
    openLayer(els.confirmModal, els.confirmModal.querySelector('[data-confirm="yes"]'));
  });
}

function settleConfirm(value) {
  if (!confirmResolve) return;
  const resolve = confirmResolve;
  confirmResolve = null;
  closeLayer(els.confirmModal);
  resolve(value);
}

function openNote(id) {
  const note = state.notes.find((item) => String(item.id) === String(id));
  if (!note) return;

  const color = tagColor(note.tag);
  els.noteModal.style.setProperty('--accent', color);
  els.noteModal.style.setProperty('--accent-ink', inkFor(color));
  els.noteContent.style.setProperty('--tag', color);
  els.noteContent.style.setProperty('--tag-ink', inkFor(color));

  els.noteFile.textContent = note.file;
  els.noteContent.dataset.code = note.code || '';
  els.noteContent.innerHTML = noteModalHtml(note);
  openLayer(els.noteModal, els.noteModal.querySelector('.icon-btn'));
}

function openForm(note = null) {
  if (!requireEdit() || !els.formModal.hidden) return;
  if (!state.tags.length) {
    toast('Crie uma tag antes de escrever');
    openTags();
    return;
  }

  state.editingId = note ? note.id : null;
  els.form.reset();
  renderTagOptions(note ? note.tag : '');
  els.form.querySelectorAll('.is-invalid').forEach((field) => field.classList.remove('is-invalid'));

  els.formEyebrow.textContent = note ? '/ editar nota' : '/ nova nota';
  els.formTitle.textContent = note ? 'Editar nota' : 'Registre um aprendizado';
  els.formCrumb.textContent = note ? note.file : 'nova-nota.md';
  els.formSubmit.textContent = note ? 'Salvar alterações' : 'Salvar nota';

  if (note) {
    els.fTitle.value = note.title;
    els.fLang.value = note.lang && LANG_EXT[note.lang] ? note.lang : 'outro';
    els.fConcepts.value = note.concepts.join(', ');
    els.fExplanation.value = note.explanation;
    els.fCode.value = note.code;
  }

  openLayer(els.formModal, els.fTitle);
}

function openTags() {
  if (!requireEdit() || !els.tagsModal.hidden) return;
  renderTagsModal();
  openLayer(els.tagsModal, els.tagsModal.querySelector('.icon-btn'));
}

/* ---------- toast ---------- */

function toast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2800);
}

async function copyCode(text) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    toast('Código copiado');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      toast('Código copiado');
    } catch {
      toast('Não foi possível copiar');
    }
    area.remove();
  }
}

/* ---------- events ---------- */

els.grid.addEventListener('click', (event) => {
  const card = event.target.closest('.note-card');
  if (!card) return;
  if (window.getSelection().toString()) return;
  openNote(card.dataset.id);
});

els.grid.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.note-card');
  if (!card) return;
  event.preventDefault();
  openNote(card.dataset.id);
});

els.tagbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tag-slug]');
  if (!button) return;
  state.tagSlug = button.dataset.tagSlug;
  state.query = els.search.value;
  render();
});

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(renderGrid, 120);
});

els.sort.addEventListener('change', () => {
  state.sort = els.sort.value;
  renderGrid();
});

els.tagList.addEventListener('input', (event) => {
  const input = event.target.closest('input[data-tag-id]');
  if (!input) return;
  const color = safeColor(input.value);
  const row = input.closest('.tag-row');
  if (!row) return;
  row.style.setProperty('--tag', color);
  const hex = row.querySelector('.tag-row-hex');
  if (hex) hex.textContent = color.toUpperCase();
});

els.tagList.addEventListener('change', (event) => {
  const input = event.target.closest('input[data-tag-id]');
  if (!input) return;
  updateTagColor(Number(input.dataset.tagId), input.value);
});

els.tagPresets.addEventListener('click', (event) => {
  const preset = event.target.closest('[data-preset-color]');
  if (!preset) return;
  const color = safeColor(preset.dataset.presetColor);
  els.tagColor.value = color;
  els.tagColorWrap.style.setProperty('--tag', color);
});

els.tagColor.addEventListener('input', () => {
  els.tagColorWrap.style.setProperty('--tag', safeColor(els.tagColor.value));
});

els.tagForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!requireEdit()) return;

  const name = els.tagName.value.trim();
  const color = safeColor(els.tagColor.value);

  els.tagName.classList.remove('is-invalid');
  if (!name) {
    els.tagName.classList.add('is-invalid');
    els.tagName.focus();
    return;
  }

  const slug = slugify(name);
  if (!slug) {
    toast('Use letras ou números no nome da tag');
    return;
  }
  if (state.tags.some((tag) => tag.slug === slug)) {
    toast('Essa tag já existe');
    return;
  }

  try {
    db.run('INSERT INTO tags (slug, name, color, created_at) VALUES (?, ?, ?, ?)', [
      slug,
      name,
      color,
      today()
    ]);
  } catch (error) {
    console.error(error);
    toast('Não foi possível criar a tag');
    return;
  }

  commitChanges();
  renderTagsModal();
  els.tagForm.reset();
  els.tagColor.value = PRESET_COLORS[0];
  els.tagColorWrap.style.setProperty('--tag', PRESET_COLORS[0]);
  toast(`Tag "${name}" criada`);
});

els.tagName.addEventListener('input', () => els.tagName.classList.remove('is-invalid'));

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!requireEdit()) return;

  const title = els.fTitle.value.trim();
  const explanation = els.fExplanation.value.trim();
  const lang = els.fLang.value;
  const code = els.fCode.value.replace(/^\n+/, '').replace(/\s+$/, '');
  const concepts = els.fConcepts.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  const tag = state.tags.find((item) => item.id === Number(els.fTag.value)) || null;

  let valid = true;
  [els.fTitle, els.fExplanation, els.fTag].forEach((field) => field.classList.remove('is-invalid'));

  if (!title) {
    els.fTitle.classList.add('is-invalid');
    valid = false;
  }
  if (!explanation) {
    els.fExplanation.classList.add('is-invalid');
    valid = false;
  }
  if (!tag) {
    els.fTag.classList.add('is-invalid');
    valid = false;
  }

  if (!valid || !tag) {
    toast(!tag ? 'Escolha um assunto para a nota' : 'Preencha título e explicação');
    return;
  }

  const file = `${slugify(title) || 'nota'}.${LANG_EXT[lang] || 'md'}`;
  const searchText = fold(
    [title, tag.name, lang, file, explanation, concepts.join(' '), code].join(' ')
  );
  const editing = state.editingId != null
    ? state.notes.find((note) => note.id === state.editingId)
    : null;

  try {
    if (editing) {
      db.run(
        `UPDATE notes
         SET title = ?, tag_id = ?, lang = ?, file = ?, explanation = ?, code = ?,
             concepts = ?, search_text = ?, updated_at = ?
         WHERE id = ?`,
        [
          title,
          tag.id,
          lang,
          file,
          explanation,
          code,
          JSON.stringify(concepts),
          searchText,
          today(),
          editing.id
        ]
      );
    } else {
      db.run(
        `INSERT INTO notes
          (title, tag_id, lang, file, explanation, code, concepts, search_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          tag.id,
          lang,
          file,
          explanation,
          code,
          JSON.stringify(concepts),
          searchText,
          today(),
          today()
        ]
      );
    }
  } catch (error) {
    console.error(error);
    toast('Não foi possível salvar a nota');
    return;
  }

  state.editingId = null;
  closeLayer(els.formModal);
  commitChanges();

  if (editing) {
    openNote(editing.id);
    toast('Nota atualizada — baixe o learn.sqlite para commitar');
    return;
  }

  state.query = '';
  state.tagSlug = 'all';
  els.search.value = '';
  els.sort.value = 'recent';
  state.sort = 'recent';

  render();
  toast('Nota adicionada — baixe o learn.sqlite para commitar');
  document.getElementById('notas').scrollIntoView({ behavior: 'smooth' });
});

[els.fTitle, els.fExplanation].forEach((field) => {
  field.addEventListener('input', () => field.classList.remove('is-invalid'));
});

els.loginForm.addEventListener('submit', submitLogin);

[els.loginUser, els.loginPass].forEach((field) => {
  field.addEventListener('input', () => {
    field.classList.remove('is-invalid');
    els.loginError.hidden = true;
  });
});

document.addEventListener('click', (event) => {
  const confirmButton = event.target.closest('[data-confirm]');
  if (confirmButton) {
    const answer = confirmButton.dataset.confirm;
    settleConfirm(answer === 'yes' ? true : answer === 'no' ? false : null);
    return;
  }

  if (event.target.closest('[data-retry]')) {
    boot();
    return;
  }

  if (event.target.closest('[data-open-form]')) {
    openForm();
    return;
  }

  if (event.target.closest('[data-open-tags]')) {
    openTags();
    return;
  }

  if (event.target.closest('[data-open-login]')) {
    openLogin();
    return;
  }

  if (event.target.closest('[data-logout]')) {
    logout();
    return;
  }

  const closer = event.target.closest('[data-close]');
  if (closer) {
    const layer = closer.closest('.modal-layer');
    if (layer) closeLayer(layer);
    return;
  }

  const tagButton = event.target.closest('#note-content [data-tag-slug]');
  if (tagButton) {
    state.tagSlug = tagButton.dataset.tagSlug;
    state.query = '';
    els.search.value = '';
    closeLayer(els.noteModal);
    render();
    document.getElementById('notas').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  if (event.target.closest('#note-content [data-copy]')) {
    copyCode(els.noteContent.dataset.code);
    return;
  }

  if (event.target.closest('[data-download-db]')) {
    downloadDb();
    return;
  }

  const discard = event.target.closest('[data-discard-db]');
  if (discard) {
    if (discard.dataset.armed !== '1') {
      discard.dataset.armed = '1';
      discard.classList.add('is-armed');
      discard.textContent = 'confirmar descarte?';
      window.setTimeout(() => {
        if (!discard.isConnected) return;
        discard.dataset.armed = '0';
        discard.classList.remove('is-armed');
        discard.textContent = 'descartar rascunho';
      }, 3200);
      return;
    }

    discardDraft();
    return;
  }

  const editButton = event.target.closest('#note-content [data-edit]');
  if (editButton) {
    if (!requireEdit()) return;
    const note = state.notes.find((item) => String(item.id) === String(editButton.dataset.edit));
    if (!note) return;
    closeLayer(els.noteModal);
    openForm(note);
    return;
  }

  const deleteButton = event.target.closest('#note-content [data-delete]');
  if (deleteButton) {
    if (!requireEdit()) return;
    if (deleteButton.dataset.armed !== '1') {
      deleteButton.dataset.armed = '1';
      deleteButton.classList.add('is-armed');
      deleteButton.textContent = 'confirmar exclusão?';
      window.setTimeout(() => {
        if (!deleteButton.isConnected) return;
        deleteButton.dataset.armed = '0';
        deleteButton.classList.remove('is-armed');
        deleteButton.textContent = 'excluir nota';
      }, 3200);
      return;
    }

    const id = Number(deleteButton.dataset.delete);
    try {
      db.run('DELETE FROM notes WHERE id = ?', [id]);
    } catch (error) {
      console.error(error);
      toast('Não foi possível excluir a nota');
      return;
    }
    closeLayer(els.noteModal);
    commitChanges();
    toast('Nota removida — baixe o learn.sqlite para commitar');
    return;
  }

  if (event.target.closest('#empty-state [data-clear]')) {
    state.query = '';
    state.tagSlug = 'all';
    els.search.value = '';
    render();
    els.search.focus();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const openModal = document.querySelector('.modal-layer:not([hidden])');
    if (openModal === els.confirmModal) {
      settleConfirm(null);
      return;
    }
    if (openModal) closeLayer(openModal);
    return;
  }

  const element = document.activeElement;
  const typing = element && (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable);
  const modalOpen = Boolean(document.querySelector('.modal-layer:not([hidden])'));

  if (typing || modalOpen) return;

  if (event.key === '/') {
    event.preventDefault();
    els.search.focus();
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    els.search.focus();
  }
});

/* ---------- init ---------- */

document.getElementById('footer-year').textContent = new Date().getFullYear();

renderPresets();
applyAuth();
boot();
