/* =========================================================
   learn.log — site estático: cards autorados no HTML
   ========================================================= */

(function () {
  'use strict';

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

  const els = {
    search: document.getElementById('search-input'),
    sort: document.getElementById('sort-select'),
    tagbar: document.getElementById('tagbar'),
    grid: document.getElementById('notes-grid'),
    empty: document.getElementById('empty-state'),
    resultCount: document.getElementById('result-count'),
    statNotes: document.getElementById('stat-notes'),
    statTags: document.getElementById('stat-tags'),
    statLines: document.getElementById('stat-lines'),
    noteModal: document.getElementById('note-modal'),
    noteFile: document.getElementById('note-file'),
    noteContent: document.getElementById('note-content'),
    toast: document.getElementById('toast')
  };

  const state = {
    cards: [],
    tags: [],
    query: '',
    activeSlug: 'all',
    sort: 'recent'
  };

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

  function normalize(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
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

  function readingMinutes(card) {
    const words = `${card.explanationText} ${card.concepts.join(' ')}`
      .split(/\s+/)
      .filter(Boolean).length;
    const codeLines = card.code ? card.code.split('\n').length : 0;
    return Math.max(2, Math.round(words / 130 + codeLines / 18));
  }

  function excerptOf(text) {
    const clean = normalize(text);
    return clean.length > 150 ? `${clean.slice(0, 147).trimEnd()}…` : clean;
  }

  function setTagClass(element, slug) {
    for (const name of [...element.classList]) {
      if (name.startsWith('tag-')) element.classList.remove(name);
    }
    if (slug) element.classList.add(`tag-${slug}`);
  }

  /* ---------- classes ---------- */

  class Tag {
    constructor(name, slug) {
      this.name = name;
      this.slug = slug;
      this.className = `tag-${slug}`;
      this.count = 0;
    }
  }

  class Card {
    constructor(fields) {
      Object.assign(this, fields);
    }

    static fromElement(article, index, tagMap) {
      const title = normalize(article.querySelector('h2')?.textContent);
      const tagName = normalize(article.querySelector('.tag')?.textContent);

      if (!title || !tagName) {
        console.warn('learn.log: card ignorado — título e tag são obrigatórios.', article);
        return null;
      }

      const slug = slugify(tagName) || 'outro';
      let tag = tagMap.get(slug);
      if (!tag) {
        tag = new Tag(tagName, slug);
        tagMap.set(slug, tag);
      }
      tag.count += 1;

      const lang = normalize(article.querySelector('.lang')?.textContent) || 'outro';
      const file = normalize(article.querySelector('.file')?.textContent)
        || `${slugify(title) || 'nota'}.${LANG_EXT[lang] || 'md'}`;

      const dateEl = article.querySelector('time.date');
      const date = normalize(dateEl?.getAttribute('datetime') || dateEl?.textContent) || today();

      const explanationEl = article.querySelector('.explanation');
      const explanationHtml = explanationEl ? explanationEl.innerHTML.trim() : '';
      const explanationText = explanationEl ? normalize(explanationEl.textContent) : '';
      const firstParagraph = explanationEl ? explanationEl.querySelector('p') : null;
      const excerptText = normalize((firstParagraph || explanationEl)?.textContent);

      const pre = article.querySelector('pre.code');
      const code = pre ? pre.textContent.replace(/^\n+/, '').replace(/\n+$/, '') : '';

      const concepts = [...article.querySelectorAll('.concepts li')]
        .map((item) => normalize(item.textContent))
        .filter(Boolean);

      const searchText = fold([
        title,
        tagName,
        lang,
        file,
        explanationText,
        concepts.join(' '),
        code
      ].join(' '));

      return new Card({
        index,
        title,
        tag,
        lang,
        file,
        date,
        explanationHtml,
        explanationText,
        excerptText,
        code,
        concepts,
        searchText
      });
    }
  }

  function readSource() {
    const articles = [...els.grid.querySelectorAll(':scope > .card')];
    const tagMap = new Map();
    const cards = [];

    for (const article of articles) {
      const card = Card.fromElement(article, cards.length, tagMap);
      if (card) cards.push(card);
    }

    els.grid.innerHTML = '';

    return {
      cards,
      tags: [...tagMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    };
  }

  /* ---------- syntax highlight ---------- */

  const TOKEN_RE = /(#[0-9a-fA-F]{3,8}\b)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|delete|void|yield|await|async|import|export|from|default|try|catch|finally|throw|null|undefined|true|false|interface|type|enum|implements|public|private|protected|readonly|as|of|in|def|elif|lambda|pass|none|print|and|or|not|is|with|select|from|where|left|right|inner|outer|join|on|group|order|by|having|limit|insert|into|values|update|set|delete|create|table|count|sum|pick|squash|reword|drop)\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z-]+)(?=\s*:)|(\b\d+(?:\.\d+)?\b)/gi;

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

  function cardHtml(card) {
    const preview = card.code ? codeWindowHtml(card.code, card.file, { preview: true }) : '';

    return `<article class="note-card ${card.tag.className}" tabindex="0" role="button" data-index="${card.index}" aria-label="Abrir nota: ${esc(card.title)}">
      <div class="card-top">
        <div class="chip-row"><span class="chip chip-tag ${card.tag.className}"><i class="dot" aria-hidden="true"></i>${esc(card.tag.name)}</span></div>
        <span class="card-open">${ARROW_ICON}</span>
      </div>
      <h3>${esc(card.title)}</h3>
      <p class="excerpt">${esc(excerptOf(card.excerptText || card.explanationText))}</p>
      ${preview}
      <div class="card-foot">
        <time datetime="${esc(card.date)}">${esc(formatDate(card.date))}</time>
        <span aria-hidden="true">·</span>
        <span>${readingMinutes(card)} min de leitura</span>
        <span class="spacer"></span>
        <span class="card-lang">${esc(card.lang)}</span>
      </div>
    </article>`;
  }

  function renderTagbar() {
    const scrollLeft = els.tagbar.scrollLeft;
    const allActive = state.activeSlug === 'all';

    const allChip = `<button class="chip chip-filter chip-all${allActive ? ' is-active' : ''}" type="button" data-tag-slug="all" aria-pressed="${allActive}">
        <i class="dot" aria-hidden="true"></i>todos
        <span class="chip-count">${state.cards.length}</span>
      </button>`;

    const chips = state.tags
      .filter((tag) => tag.count > 0)
      .map((tag) => {
        const active = state.activeSlug === tag.slug;
        return `<button class="chip chip-filter ${tag.className}${active ? ' is-active' : ''}" type="button" data-tag-slug="${esc(tag.slug)}" aria-pressed="${active}">
        <i class="dot" aria-hidden="true"></i>${esc(tag.name)}
        <span class="chip-count">${tag.count}</span>
      </button>`;
      })
      .join('');

    els.tagbar.innerHTML = allChip + chips;
    els.tagbar.scrollLeft = scrollLeft;
  }

  function getFiltered() {
    const terms = fold(state.query).trim().split(/\s+/).filter(Boolean);

    const filtered = state.cards.filter((card) => {
      if (state.activeSlug !== 'all' && card.tag.slug !== state.activeSlug) return false;
      return terms.every((term) => card.searchText.includes(term));
    });

    if (state.sort === 'oldest') {
      filtered.sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
    } else if (state.sort === 'az') {
      filtered.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR') || a.index - b.index);
    } else {
      filtered.sort((a, b) => b.date.localeCompare(a.date) || a.index - b.index);
    }

    return filtered;
  }

  function renderEmpty(filtered) {
    const hasFilters = Boolean(state.query.trim()) || state.activeSlug !== 'all';

    if (!state.cards.length) {
      els.empty.innerHTML = `<div class="empty-inner">
          <span class="empty-badge">{ }</span>
          <h3>Nenhuma nota ainda</h3>
          <p>Escreva as notas como <code>&lt;article class="card"&gt;</code> dentro de <code>#notes-grid</code> no <code>index.html</code>.</p>
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

    const filteredActive = Boolean(state.query.trim()) || state.activeSlug !== 'all';
    els.resultCount.textContent = filteredActive
      ? `${filtered.length} de ${state.cards.length} notas`
      : `${state.cards.length} ${state.cards.length === 1 ? 'nota' : 'notas'}`;
  }

  function renderStats() {
    let lines = 0;
    for (const card of state.cards) {
      lines += card.code ? card.code.split('\n').length : 0;
    }

    els.statNotes.textContent = new Intl.NumberFormat('pt-BR').format(state.cards.length);
    els.statTags.textContent = new Intl.NumberFormat('pt-BR').format(state.tags.length);
    els.statLines.textContent = new Intl.NumberFormat('pt-BR').format(lines);
  }

  function syncAccent() {
    const active = state.activeSlug !== 'all'
      ? state.tags.find((tag) => tag.slug === state.activeSlug)
      : null;

    const latest = [...state.cards]
      .sort((a, b) => b.date.localeCompare(a.date) || a.index - b.index)[0];

    const slug = active ? active.slug : (latest ? latest.tag.slug : '');
    setTagClass(document.body, slug);
  }

  function render() {
    renderTagbar();
    renderGrid();
    renderStats();
    syncAccent();
  }

  /* ---------- note modal ---------- */

  function noteModalHtml(card) {
    const code = card.code ? codeWindowHtml(card.code, card.file, { copy: true }) : '';
    const concepts = card.concepts.length
      ? `<div class="concepts">
          <span class="label">conceitos-chave</span>
          <div class="chip-row">${card.concepts.map((item) => `<span class="chip">${esc(item)}</span>`).join('')}</div>
        </div>`
      : '';

    return `<div class="note-head">
        <div class="chip-row">
          <button class="chip chip-tag ${card.tag.className}" type="button" data-tag-slug="${esc(card.tag.slug)}"><i class="dot" aria-hidden="true"></i>${esc(card.tag.name)}</button>
        </div>
        <h2 id="note-title">${esc(card.title)}</h2>
        <div class="note-meta">
          <span>${esc(formatDate(card.date))}</span>
          <span aria-hidden="true">·</span>
          <span>${readingMinutes(card)} min de leitura</span>
          <span aria-hidden="true">·</span>
          <span class="path">~/notes/${esc(card.file)}</span>
        </div>
      </div>
      <div class="note-body">
        <div class="prose">${card.explanationHtml}</div>
        ${code}
        ${concepts}
        <div class="note-actions">
          <button class="btn btn-ghost" type="button" data-close>fechar</button>
        </div>
      </div>`;
  }

  function openNote(index) {
    const card = state.cards.find((item) => item.index === index);
    if (!card) return;

    setTagClass(els.noteModal, card.tag.slug);
    els.noteFile.textContent = card.file;
    els.noteContent.dataset.code = card.code;
    els.noteContent.innerHTML = noteModalHtml(card);
    openLayer(els.noteModal, els.noteModal.querySelector('.icon-btn'));
  }

  /* ---------- layers ---------- */

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

  /* ---------- toast / copy ---------- */

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
    openNote(Number(card.dataset.index));
  });

  els.grid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.note-card');
    if (!card) return;
    event.preventDefault();
    openNote(Number(card.dataset.index));
  });

  els.tagbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag-slug]');
    if (!button) return;
    state.activeSlug = button.dataset.tagSlug;
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

  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close]');
    if (closer) {
      const layer = closer.closest('.modal-layer');
      if (layer) closeLayer(layer);
      return;
    }

    const modalTag = event.target.closest('#note-content [data-tag-slug]');
    if (modalTag) {
      state.activeSlug = modalTag.dataset.tagSlug;
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

    if (event.target.closest('#empty-state [data-clear]')) {
      state.query = '';
      state.activeSlug = 'all';
      els.search.value = '';
      render();
      els.search.focus();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const openModal = document.querySelector('.modal-layer:not([hidden])');
      if (openModal) closeLayer(openModal);
      return;
    }

    const element = document.activeElement;
    const typing = element && (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable);
    if (typing || document.querySelector('.modal-layer:not([hidden])')) return;

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

  const source = readSource();
  state.cards = source.cards;
  state.tags = source.tags;
  els.sort.value = state.sort;
  render();
})();
