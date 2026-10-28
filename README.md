# learn.log

Um devlog pessoal **100% estático** para anotar aprendizados de programação: snippets, explicações curtas e tags com cor. As notas são escritas direto no `index.html`; o JavaScript lê esses cards e monta filtros, busca, estatísticas e o modal de leitura.

Não há banco de dados, servidor, login, rascunho local nem build. São três arquivos e um README.

## Como abrir

- **Duplo clique** em `index.html` — funciona direto via `file://`.
- Ou sirva a pasta localmente, se preferir:

  ```sh
  python -m http.server 8000
  # depois abra http://localhost:8000
  ```

## Estrutura

```
index.html   página + notas autoradas em <article class="card">
styles.css   visual completo + uma classe de cor para cada tag
app.js       classes Card/Tag, leitura do HTML e comportamento
README.md    este arquivo
```

## Como adicionar uma nota

As notas ficam dentro de `#notes-grid` no `index.html`. Copie o modelo abaixo e edite o conteúdo:

```html
<article class="card">
  <h2>Closures: funções que lembram de onde nasceram</h2>
  <p class="tag">javascript</p>
  <p class="lang">javascript</p>
  <p class="file">closures.js</p>
  <time class="date" datetime="2026-10-27">2026-10-27</time>
  <div class="explanation">
    <p>Uma explicação curta com <code>código inline</code> e <strong>destaque</strong>.</p>
    <ul>
      <li>Um tópico.</li>
      <li>Outro tópico.</li>
    </ul>
  </div>
  <pre class="code"><code>const total = 1;
console.log(total);</code></pre>
  <ul class="concepts">
    <li>escopo léxico</li>
    <li>estado privado</li>
  </ul>
</article>
```

### Elementos e valores padrão

| Elemento | Obrigatório | Padrão quando ausente |
| --- | --- | --- |
| `<h2>` | sim | — (card ignorado) |
| `.tag` | sim | — (card ignorado) |
| `.lang` | não | `outro` |
| `.file` | não | `slug(título).ext` da linguagem |
| `time.date` | não | data de hoje |
| `.explanation` | não | vazio |
| `pre.code` | não | sem bloco de código |
| `.concepts li` | não | sem conceitos |

Observações:

- A `tag` é o nome do assunto; o site gera o slug e a contagem automaticamente.
- O atributo `datetime` da data tem prioridade sobre o texto visível.
- Cards sem título ou sem tag são ignorados com um aviso no console.
- `.explanation` aceita HTML (é conteúdo do autor). Os demais campos — título, tag, arquivo e código — são sempre escapados.
- Dentro de `pre.code`, escape `<` como `&lt;` e `&` como `&amp;`. O `>` não precisa de escape.

## Como criar ou mudar a cor de uma tag

As cores vivem **somente no CSS**. Cada tag usa a classe `.tag-<slug>`, gerada a partir do nome:

- `javascript` → `.tag-javascript`
- `UI/UX` → `.tag-ui-ux`
- `C#` → `.tag-c`

Adicione uma regra em `styles.css`:

```css
.tag-rust {
  --tag: #d97b4f;
  --tag-ink: #121210;
  --accent: #d97b4f;
  --accent-ink: #121210;
}
```

- `--tag`: cor do card, do chip e do filtro.
- `--tag-ink`: cor do texto quando o chip está ativo (use tom escuro em cores claras e claro em cores escuras).
- `--accent` / `--accent-ink`: cor de destaque da página e do modal quando a tag está ativa.

Tags sem regra própria caem no **fallback coral** (`#ee8079`). Não é preciso mexer no JavaScript para criar uma tag: basta usar o nome no card e, se quiser cor própria, adicionar a classe no CSS.

## Como o site funciona

1. `app.js` lê os `article.card` de `#notes-grid` **antes** de qualquer renderização, cria objetos `Tag` e `Card`, e só então substitui o conteúdo do grid. Busca, filtro e ordenação trabalham em memória, nunca relendo o DOM.
2. **Filtros**: a barra de assuntos mostra todas as tags usadas, com contagem. O filtro ativo também define a cor de destaque da página.
3. **Busca**: procura em título, tag, linguagem, arquivo, explicação, conceitos e código. Ignora acentos e maiúsculas, e todos os termos digitados precisam aparecer.
4. **Ordenação**: mais recentes, mais antigas ou título A–Z.
5. **Modal**: clique (ou Enter/Espaço) em um card para ler a explicação completa, o código com destaque e os conceitos. O botão **copiar** copia o snippet; o chip da tag dentro do modal filtra por ela e fecha a nota.
6. **Estatísticas**: número de notas, de assuntos e de linhas de código, calculados a partir dos cards.
7. **Atalhos**: `/` ou `Ctrl/Cmd + K` focam a busca; `Esc` fecha o modal.

Para mudar uma nota, edite o card no HTML. Para remover, apague o `<article class="card">` inteiro. O restante da página se ajusta sozinho.

## Publicação

O site não precisa de configuração especial. No GitHub Pages, publique a raiz do repositório (`index.html`, `styles.css` e `app.js`) e pronto.

As fontes Inter e JetBrains Mono vêm do Google Fonts; sem internet, o navegador usa as fontes de sistema definidas no CSS. O conteúdo é somente leitura no navegador — alterações acontecem editando o HTML e commitando.
