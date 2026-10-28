/* learn.log — schema e conteúdo inicial do banco SQLite.
   Usado por scripts de build para gerar data/learn.sqlite. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LearnSeed = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const SCHEMA = `
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      tag_id INTEGER NOT NULL REFERENCES tags(id),
      lang TEXT NOT NULL DEFAULT '',
      file TEXT NOT NULL DEFAULT '',
      explanation TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      concepts TEXT NOT NULL DEFAULT '[]',
      search_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notes_tag ON notes(tag_id);
    CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
  `;

  const TAGS = [
    { slug: 'javascript', name: 'javascript', color: '#efb041', createdAt: '2026-10-01' },
    { slug: 'css', name: 'css', color: '#86a7d8', createdAt: '2026-10-01' },
    { slug: 'react', name: 'react', color: '#73b78e', createdAt: '2026-10-01' },
    { slug: 'git', name: 'git', color: '#ee8079', createdAt: '2026-10-01' },
    { slug: 'python', name: 'python', color: '#b79be0', createdAt: '2026-10-01' },
    { slug: 'sql', name: 'sql', color: '#e8a87c', createdAt: '2026-10-01' },
    { slug: 'typescript', name: 'typescript', color: '#7f9cf5', createdAt: '2026-10-01' },
    { slug: 'web', name: 'web', color: '#c9b26b', createdAt: '2026-10-01' }
  ];

  const NOTES = [
    {
      title: 'Closures: funções que lembram de onde nasceram',
      tag: 'javascript',
      lang: 'javascript',
      file: 'closures.js',
      explanation:
        'Uma closure nasce quando uma função interna continua acessando o escopo onde foi criada, mesmo depois que a função externa terminou de executar.\n\nO valor não é copiado: a função mantém uma referência viva ao ambiente léxico. Por isso `total` sobrevive entre as chamadas e cada chamada de `criarContador()` cria um estado independente.\n\n- Cada chamada cria um novo escopo.\n- As variáveis ficam privadas, inacessíveis de fora.\n- Módulos e memoização dependem desse comportamento.\n\nCuidado com o clássico loop usando `var`: todas as funções acabam apontando para a mesma variável.',
      code:
        'function criarContador() {\n  let total = 0;\n\n  return function () {\n    total += 1;\n    return total;\n  };\n}\n\nconst contador = criarContador();\ncontador(); // 1\ncontador(); // 2',
      concepts: ['escopo léxico', 'estado privado', 'fábrica de funções'],
      createdAt: '2026-10-27',
      updatedAt: '2026-10-27'
    },
    {
      title: 'Grid responsivo com uma linha de CSS',
      tag: 'css',
      lang: 'css',
      file: 'galeria.css',
      explanation:
        '`repeat(auto-fit, minmax(220px, 1fr))` já resolve a maior parte dos grids responsivos: cada coluna tem no mínimo 220px e dividem o espaço restante igualmente, quebrando linhas quando necessário.\n\nA diferença entre `auto-fit` e `auto-fill` aparece quando sobram colunas: `auto-fit` colapsa as vazias e estica as existentes; `auto-fill` mantém os espaços fantasma.\n\n- `minmax(0, 1fr)` evita estouro de conteúdo.\n- `gap` substitui margins entre itens.\n- `min-width: 0` em filhos ajuda com textos longos.',
      code:
        '.galeria {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));\n  gap: 16px;\n}\n\n.galeria > article {\n  min-width: 0;\n  padding: 20px;\n  border: 1px solid #24241f;\n  border-radius: 12px;\n}',
      concepts: ['auto-fit', 'minmax', 'container'],
      createdAt: '2026-10-25',
      updatedAt: '2026-10-25'
    },
    {
      title: 'useEffect sem cleanup é uma armadilha',
      tag: 'react',
      lang: 'react',
      file: 'nota.jsx',
      explanation:
        'Todo efeito que cria algo fora do React precisa devolver uma função de limpeza. O cleanup roda antes do próximo efeito e quando o componente é desmontado.\n\nNo exemplo, a flag `ativo` evita atualizar estado depois que o componente sai da tela ou o `id` muda. Sem isso, uma resposta antiga pode vencer uma requisição mais recente — a clássica race condition.\n\n- Dependências controlam quando o efeito roda.\n- Requisições podem ser canceladas com `AbortController`.\n- Timers e listeners sempre precisam de cleanup.',
      code:
        'import { useEffect, useState } from "react";\n\nexport function Nota({ id }) {\n  const [nota, setNota] = useState(null);\n\n  useEffect(() => {\n    let ativo = true;\n\n    fetch("/api/notas/" + id)\n      .then((res) => res.json())\n      .then((dados) => {\n        if (ativo) setNota(dados);\n      });\n\n    return () => {\n      ativo = false;\n    };\n  }, [id]);\n\n  return nota ? <h1>{nota.titulo}</h1> : null;\n}',
      concepts: ['modelo de efeito', 'race condition', 'AbortController'],
      createdAt: '2026-10-23',
      updatedAt: '2026-10-23'
    },
    {
      title: 'Rebase interativo: limpando o histórico',
      tag: 'git',
      lang: 'shell',
      file: 'rebase.sh',
      explanation:
        '`git rebase -i` abre uma lista de commits para reescrever. Você escolhe o que manter (`pick`), junta (`squash`), reescreve a mensagem (`reword`) ou remove (`drop`).\n\nO resultado é um histórico linear e fácil de bisectar. A contrapartida: os commits são recriados com novos hashes, então nunca faça rebase de algo que outra pessoa já usa.\n\n- `squash` junta commits e pede uma mensagem final.\n- `fixup` junta sem abrir o editor.\n- Se der errado: `git rebase --abort`.',
      code:
        'git fetch origin\ngit rebase -i origin/main\n\n# no editor, troque pick por squash\npick   a1b2c3d adiciona card\nsquash d4e5f6a corrige espaçamento\nreword 7890abc ajusta copy',
      concepts: ['rebase interativo', 'squash', 'histórico'],
      createdAt: '2026-10-21',
      updatedAt: '2026-10-21'
    },
    {
      title: 'Comprehensions que ainda dá pra ler',
      tag: 'python',
      lang: 'python',
      file: 'comprehensions.py',
      explanation:
        'Comprehensions são ótimas quando cabem em **uma linha e um pensamento**. List, dict e set comprehensions evitam o loop com `append` e deixam a intenção explícita.\n\nQuando existe mais de um `for` ou uma condição aninhada demais, volte para o loop normal. Legibilidade ganha da esperteza.\n\n- Use generators quando não precisa materializar a lista.\n- `sum(1 for ...)` conta sem criar array intermediário.\n- Dict comprehension exige chave e valor.',
      code:
        'pares_ao_quadrado = [n ** 2 for n in range(10) if n % 2 == 0]\n\ntitulos_por_id = {nota.id: nota.titulo for nota in notas}\n\ncontagem = sum(1 for n in numeros if n > 0)',
      concepts: ['legibilidade', 'generator', 'filtro'],
      createdAt: '2026-10-19',
      updatedAt: '2026-10-19'
    },
    {
      title: 'LEFT JOIN: o que não casa também importa',
      tag: 'sql',
      lang: 'sql',
      file: 'joins.sql',
      explanation:
        '`INNER JOIN` devolve só os pares que existem dos dois lados. `LEFT JOIN` mantém todas as linhas da esquerda, preenchendo o resto com `NULL` — inclusive usuários sem nenhuma nota.\n\nUm detalhe que morde: filtros no `WHERE` sobre a tabela da direita transformam o `LEFT JOIN` em `INNER`. Se quer preservar quem não tem correspondência, coloque a condição no `ON`.\n\n- `COUNT(coluna)` ignora `NULL`; `COUNT(*)` não.\n- `HAVING` filtra depois da agregação.\n- Sempre qualifique as colunas no `ON`.',
      code:
        'SELECT u.nome, COUNT(n.id) AS total_notas\nFROM usuarios u\nLEFT JOIN notas n ON n.usuario_id = u.id\nGROUP BY u.id, u.nome\nHAVING COUNT(n.id) > 0\nORDER BY total_notas DESC;',
      concepts: ['left join', 'agregação', 'where vs on'],
      createdAt: '2026-10-16',
      updatedAt: '2026-10-16'
    },
    {
      title: 'Generics: flexibilidade sem perder tipos',
      tag: 'typescript',
      lang: 'typescript',
      file: 'primeiro.ts',
      explanation:
        'Generics permitem escrever uma função que funciona para vários tipos sem abrir mão do retorno tipado. O `T` é um parâmetro de tipo: quem chama decide o valor dele, e o TypeScript infere na maioria dos casos.\n\nUse constraints (`T extends { id: string }`) quando o corpo precisa acessar propriedades específicas. Sem constraint, o tipo é tão aberto que você não consegue fazer quase nada.\n\n- Evite `any` disfarçado de generic.\n- Prefira inferência a tipar tudo na mão.\n- Generics também valem para componentes e hooks.',
      code:
        'function primeiro<T>(itens: T[]): T | undefined {\n  return itens[0];\n}\n\nconst nota = primeiro([{ titulo: "closures" }]);\n// nota: { titulo: string } | undefined',
      concepts: ['parâmetro de tipo', 'constraints', 'inferência'],
      createdAt: '2026-10-12',
      updatedAt: '2026-10-12'
    },
    {
      title: 'Persistência local: rascunhos que sobrevivem ao refresh',
      tag: 'web',
      lang: 'javascript',
      file: 'rascunho.js',
      explanation:
        '`localStorage` guarda strings por origem, de forma síncrona e sem prazo de validade. Para objetos, o caminho é `JSON.stringify` na escrita e `JSON.parse` na leitura — com tratamento para valores corrompidos.\n\nÉ útil para preferências e rascunhos pequenos. Nesta página, a sessão de edição fica no `sessionStorage` e o rascunho do banco SQLite fica no `localStorage` até ser baixado e commitado.\n\n- Limite de ~5 MB por origem.\n- É síncrono: bloqueia a main thread.\n- `sessionStorage` morre ao fechar a aba.\n\nPara dados compartilhados, o conteúdo precisa ir para o repositório.',
      code:
        'const CHAVE = "learn:rascunho";\n\nexport function carregar() {\n  try {\n    return JSON.parse(localStorage.getItem(CHAVE)) ?? null;\n  } catch {\n    return null;\n  }\n}\n\nexport function salvar(dados) {\n  localStorage.setItem(CHAVE, JSON.stringify(dados));\n}',
      concepts: ['JSON', 'por origem', 'rascunho'],
      createdAt: '2026-10-08',
      updatedAt: '2026-10-08'
    }
  ];

  function fold(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function searchOf(note, tagName) {
    return fold(
      [
        note.title,
        tagName,
        note.lang,
        note.file,
        note.explanation,
        (note.concepts || []).join(' '),
        note.code
      ].join(' ')
    );
  }

  function install(db) {
    db.exec(SCHEMA);

    const insertTag = db.prepare(
      'INSERT INTO tags (slug, name, color, created_at) VALUES (?, ?, ?, ?)'
    );
    try {
      for (const tag of TAGS) {
        insertTag.run([tag.slug, tag.name, tag.color, tag.createdAt]);
      }
    } finally {
      insertTag.free();
    }

    const tagRows = db.exec('SELECT id, slug FROM tags')[0];
    const tagIds = new Map(tagRows ? tagRows.values.map((row) => [row[1], row[0]]) : []);

    const insertNote = db.prepare(
      `INSERT INTO notes
        (title, tag_id, lang, file, explanation, code, concepts, search_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    try {
      for (const note of NOTES) {
        const tagName = TAGS.find((tag) => tag.slug === note.tag)?.name || note.tag;
        insertNote.run([
          note.title,
          tagIds.get(note.tag),
          note.lang,
          note.file,
          note.explanation,
          note.code,
          JSON.stringify(note.concepts || []),
          searchOf(note, tagName),
          note.createdAt,
          note.updatedAt
        ]);
      }
    } finally {
      insertNote.free();
    }

    return db;
  }

  return { SCHEMA, TAGS, NOTES, fold, searchOf, install };
});
