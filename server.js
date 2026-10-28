#!/usr/bin/env node
'use strict';

/* =========================================================
   learn.log — servidor local (Node + SQLite)
   ---------------------------------------------------------
   O navegador é a origem das mudanças: tudo fica no
   localStorage até o botão "Salvar mudanças". Nesse momento
   o app envia a fila de operações e o servidor aplica em
   data/learn.sqlite, registrando também cada evento
   (create / update / view / delete) na tabela events.
   ========================================================= */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'learn.sqlite');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || 'localhost';

const LearnSeed = require('./data/seed.js');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);

db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = DELETE');
db.exec('PRAGMA busy_timeout = 5000');

/* ---------- schema ---------- */

function tableExists(name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

function columnNames(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function migrate() {
  const hadTags = tableExists('tags');
  const hadNotes = tableExists('notes');

  db.exec(LearnSeed.SCHEMA);

  if (!hadTags && !hadNotes) LearnSeed.install(db);

  const tagColumns = columnNames('tags');
  if (!tagColumns.includes('uid')) db.exec('ALTER TABLE tags ADD COLUMN uid TEXT');
  if (!tagColumns.includes('updated_at')) db.exec('ALTER TABLE tags ADD COLUMN updated_at TEXT');

  db.exec("UPDATE tags SET uid = 'tag-' || slug WHERE uid IS NULL OR uid = ''");
  db.exec("UPDATE tags SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_uid ON tags(uid)');

  const noteColumns = columnNames('notes');
  if (!noteColumns.includes('uid')) db.exec('ALTER TABLE notes ADD COLUMN uid TEXT');
  if (!noteColumns.includes('tag_uid')) db.exec('ALTER TABLE notes ADD COLUMN tag_uid TEXT');

  db.exec("UPDATE notes SET uid = 'note-' || id WHERE uid IS NULL OR uid = ''");
  db.exec(
    `UPDATE notes
     SET tag_uid = (SELECT uid FROM tags WHERE tags.id = notes.tag_id)
     WHERE tag_uid IS NULL OR tag_uid = ''`
  );
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_uid ON notes(uid)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notes_tag_uid ON notes(tag_uid)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      entity TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_uid TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity, entity_uid);
    CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
  `);
}

migrate();

/* ---------- helpers ---------- */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const OP_TYPES = new Set([
  'tag.create',
  'tag.update',
  'tag.delete',
  'note.create',
  'note.update',
  'note.delete',
  'note.view'
]);

function text(value, max) {
  return String(value ?? '').slice(0, max);
}

function safeColor(value) {
  const color = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : '#ee8079';
}

function cleanSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function dateOnly(value) {
  const raw = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : new Date().toISOString().slice(0, 10);
}

function isoOrNow(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/* ---------- operations ---------- */

function upsertTag(tag) {
  if (!tag || typeof tag !== 'object') throw new HttpError(400, 'tag inválida');

  const uid = text(tag.uid, 100).trim();
  const name = text(tag.name, 60).trim();
  const slug = cleanSlug(tag.slug || name);
  const color = safeColor(tag.color);
  const created = dateOnly(tag.createdAt);

  if (!uid || !name || !slug) throw new HttpError(400, 'tag sem uid, nome ou slug');

  try {
    db.prepare(
      `INSERT INTO tags (uid, slug, name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET
         slug = excluded.slug,
         name = excluded.name,
         color = excluded.color,
         updated_at = excluded.updated_at`
    ).run(uid, slug, name, color, created, created);
  } catch (error) {
    throw new HttpError(409, `não foi possível gravar a tag "${name}": ${error.message}`);
  }
}

function tagRow(uid) {
  return db.prepare('SELECT id, uid, name FROM tags WHERE uid = ?').get(uid);
}

function upsertNote(note) {
  if (!note || typeof note !== 'object') throw new HttpError(400, 'nota inválida');

  const uid = text(note.uid, 100).trim();
  const title = text(note.title, 300).trim();
  const tag = note.tag && typeof note.tag === 'object' ? note.tag : null;
  const tagUid = text(note.tagUid || (tag && tag.uid), 100).trim();

  if (!uid || !title || !tagUid) throw new HttpError(400, 'nota sem uid, título ou tag');

  let tagInfo = tagRow(tagUid);
  if (!tagInfo) {
    if (!tag || !tag.name) throw new HttpError(409, 'tag da nota ainda não chegou ao SQLite');
    upsertTag({ ...tag, uid: tagUid });
    tagInfo = tagRow(tagUid);
  }
  if (!tagInfo) throw new HttpError(409, 'tag da nota não encontrada');

  const lang = text(note.lang, 30) || 'outro';
  const file = text(note.file, 200);
  const explanation = text(note.explanation, 50000);
  const code = text(note.code, 100000);
  const concepts = Array.isArray(note.concepts)
    ? note.concepts
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const created = dateOnly(note.createdAt);
  const updated = dateOnly(note.updatedAt || note.createdAt);

  const searchText = LearnSeed.fold(
    [title, tagInfo.name, lang, file, explanation, concepts.join(' '), code].join(' ')
  );

  db.prepare(
    `INSERT INTO notes
       (uid, title, tag_id, tag_uid, lang, file, explanation, code, concepts, search_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET
       title = excluded.title,
       tag_id = excluded.tag_id,
       tag_uid = excluded.tag_uid,
       lang = excluded.lang,
       file = excluded.file,
       explanation = excluded.explanation,
       code = excluded.code,
       concepts = excluded.concepts,
       search_text = excluded.search_text,
       updated_at = excluded.updated_at`
  ).run(
    uid,
    title,
    tagInfo.id,
    tagUid,
    lang,
    file,
    explanation,
    code,
    JSON.stringify(concepts),
    searchText,
    created,
    updated
  );
}

function applyOperation(op) {
  const payload = op.payload;

  switch (op.type) {
    case 'tag.create':
    case 'tag.update':
      upsertTag(payload);
      break;

    case 'tag.delete': {
      const notes = db.prepare('SELECT COUNT(*) AS total FROM notes WHERE tag_uid = ?').get(payload.uid);
      if (!notes || notes.total === 0) {
        db.prepare('DELETE FROM tags WHERE uid = ?').run(payload.uid);
      }
      break;
    }

    case 'note.create':
    case 'note.update':
      upsertNote(payload);
      break;

    case 'note.delete':
      db.prepare('DELETE FROM notes WHERE uid = ?').run(payload.uid);
      break;

    case 'note.view':
      break;

    default:
      throw new HttpError(400, `operação desconhecida: ${op.type}`);
  }
}

function applyOperations(operations) {
  const applied = [];

  db.exec('BEGIN IMMEDIATE');
  try {
    const insertEvent = db.prepare(
      `INSERT OR IGNORE INTO events (uid, entity, action, entity_uid, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const op of operations) {
      if (!op || typeof op !== 'object') throw new HttpError(400, 'operação inválida');
      if (!OP_TYPES.has(op.type)) throw new HttpError(400, `tipo de operação inválido: ${op.type}`);
      if (typeof op.id !== 'string' || !op.id.trim()) throw new HttpError(400, 'operação sem id');
      if (!op.payload || typeof op.payload !== 'object' || !op.payload.uid) {
        throw new HttpError(400, 'operação sem entidade');
      }

      const [entity, action] = op.type.split('.');
      const event = insertEvent.run(
        op.id.trim(),
        entity,
        action,
        String(op.payload.uid),
        JSON.stringify(op.payload),
        isoOrNow(op.at)
      );

      if (!event.changes) continue;

      applyOperation(op);
      applied.push(op.id.trim());
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return applied;
}

/* ---------- state ---------- */

function readState() {
  const tags = db
    .prepare(
      `SELECT uid, slug, name, color, created_at
       FROM tags ORDER BY name COLLATE NOCASE`
    )
    .all()
    .map((row) => ({
      uid: row.uid,
      slug: row.slug,
      name: row.name,
      color: row.color,
      createdAt: row.created_at
    }));

  const notes = db
    .prepare(
      `SELECT n.uid, n.title, t.name AS tag, n.tag_uid, n.lang, n.file, n.explanation,
              n.code, n.concepts, n.created_at, n.updated_at
       FROM notes n
       JOIN tags t ON t.uid = n.tag_uid
       ORDER BY n.created_at, n.id`
    )
    .all()
    .map((row) => {
      let concepts = [];
      try {
        const parsed = JSON.parse(row.concepts);
        if (Array.isArray(parsed)) concepts = parsed.filter((item) => typeof item === 'string');
      } catch {
        concepts = [];
      }

      return {
        uid: row.uid,
        title: row.title,
        tag: row.tag,
        tagUid: row.tag_uid,
        lang: row.lang,
        file: row.file,
        explanation: row.explanation,
        code: row.code,
        concepts,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

  return { tags, notes };
}

function readEventCount() {
  return db.prepare('SELECT COUNT(*) AS total FROM events').get().total;
}

/* ---------- http ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.sqlite': 'application/vnd.sqlite3',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function readBody(request, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'payload muito grande'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/state') {
    sendJson(response, 200, {
      ...readState(),
      events: readEventCount(),
      serverTime: new Date().toISOString()
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/sync') {
    let body;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, 'JSON inválido');
    }

    const operations = Array.isArray(body.ops) ? body.ops : [];
    if (operations.length > 2000) throw new HttpError(413, 'muitas operações de uma vez');

    const applied = applyOperations(operations);
    const syncedAt = new Date().toISOString();

    sendJson(response, 200, {
      ok: true,
      applied: applied.length,
      pending: operations.length - applied.length,
      syncedAt,
      events: readEventCount(),
      state: readState()
    });
    return true;
  }

  if (url.pathname.startsWith('/api/')) {
    throw new HttpError(404, 'endpoint não encontrado');
  }

  return false;
}

async function handleStatic(request, response, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('método não permitido');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    response.end('caminho inválido');
    return;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relative);

  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403);
    response.end('acesso negado');
    return;
  }

  const blocked = relative.split(/[\\/]/).some((part) => part.startsWith('.') && part !== '.');
  if (blocked) {
    response.writeHead(403);
    response.end('acesso negado');
    return;
  }

  let info;
  try {
    info = await fsp.stat(filePath);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('não encontrado');
    return;
  }

  if (info.isDirectory()) {
    response.writeHead(404);
    response.end('não encontrado');
    return;
  }

  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': 'no-store'
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || HOST}`);

  try {
    if (await handleApi(request, response, url)) return;
    await handleStatic(request, response, url);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('erro no servidor:', error);

    if (!response.headersSent) {
      sendJson(response, status, { error: error.message || 'erro interno' });
    } else {
      response.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  learn.log — servidor local');
  console.log(`  página:  http://${HOST}:${PORT}`);
  console.log(`  sqlite:  ${path.relative(ROOT, DB_FILE)}`);
  console.log('  pare com Ctrl+C (os dados já salvos ficam no disco)');
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${PORT} já está em uso. Use PORT=outra-porta node server.js`);
    process.exit(1);
  }
  throw error;
});

function shutdown(signal) {
  console.log(`\n${signal} recebido — fechando o SQLite e saindo.`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* já fechado */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
