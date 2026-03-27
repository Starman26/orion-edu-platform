// src/components/latexParser.ts
// Lightweight LaTeX → HTML converter. Math is left intact for MathJax.

interface DocMeta {
  title: string;
  author: string;
  date: string;
}

export function latexToHtml(source: string): string {
  // ── 1. Protect math blocks by replacing with placeholders ──
  const mathSlots: string[] = [];
  const ph = (i: number) => `%%MATH_${i}%%`;

  // Helper: store math, return placeholder
  const storeMath = (m: string): string => {
    const idx = mathSlots.length;
    mathSlots.push(m);
    return ph(idx);
  };

  let src = source;

  // Remove comments (lines starting with %)
  src = src.replace(/^%.*$/gm, '');
  // Remove inline comments (% not preceded by \)
  src = src.replace(/(?<!\\)%.*$/gm, '');

  // Protect \begin{equation}...\end{equation}
  src = src.replace(/\\begin\{equation\*?\}[\s\S]*?\\end\{equation\*?\}/g, (m) => storeMath(m));
  // Protect \begin{align}...\end{align}
  src = src.replace(/\\begin\{align\*?\}[\s\S]*?\\end\{align\*?\}/g, (m) => storeMath(m));
  // Protect \begin{gather}...\end{gather}
  src = src.replace(/\\begin\{gather\*?\}[\s\S]*?\\end\{gather\*?\}/g, (m) => storeMath(m));
  // Protect display math $$...$$
  src = src.replace(/\$\$[\s\S]*?\$\$/g, (m) => storeMath(m));
  // Protect \[...\]
  src = src.replace(/\\\[[\s\S]*?\\\]/g, (m) => storeMath(m));
  // Protect inline math $...$  (not escaped \$)
  src = src.replace(/(?<!\\)\$(?!\$)(.+?)(?<!\\)\$/g, (m) => storeMath(m));
  // Protect \(...\)
  src = src.replace(/\\\([\s\S]*?\\\)/g, (m) => storeMath(m));

  // ── 2. Extract metadata ──
  const meta: DocMeta = { title: '', author: '', date: '' };
  src = src.replace(/\\title\{([^}]*)\}/g, (_, t) => { meta.title = t; return ''; });
  src = src.replace(/\\author\{([^}]*)\}/g, (_, a) => { meta.author = a; return ''; });
  src = src.replace(/\\date\{([^}]*)\}/g, (_, d) => { meta.date = d; return ''; });

  let hasMaketitle = false;
  src = src.replace(/\\maketitle/g, () => { hasMaketitle = true; return '%%MAKETITLE%%'; });

  // ── 3. Remove \documentclass, \usepackage, \begin{document}, \end{document} ──
  src = src.replace(/\\documentclass(\[.*?\])?\{.*?\}/g, '');
  src = src.replace(/\\usepackage(\[.*?\])?\{.*?\}/g, '');
  src = src.replace(/\\begin\{document\}/g, '');
  src = src.replace(/\\end\{document\}/g, '');

  // ── 4. Section counters ──
  let sectionCount = 0;
  let subsectionCount = 0;
  let subsubsectionCount = 0;

  // Sections
  src = src.replace(/\\section\{([^}]*)\}/g, (_, t) => {
    sectionCount++;
    subsectionCount = 0;
    subsubsectionCount = 0;
    return `\n<h2>${sectionCount}. ${t}</h2>\n`;
  });

  src = src.replace(/\\subsection\{([^}]*)\}/g, (_, t) => {
    subsectionCount++;
    subsubsectionCount = 0;
    return `\n<h3>${sectionCount}.${subsectionCount} ${t}</h3>\n`;
  });

  src = src.replace(/\\subsubsection\{([^}]*)\}/g, (_, t) => {
    subsubsectionCount++;
    return `\n<h4>${sectionCount}.${subsectionCount}.${subsubsectionCount} ${t}</h4>\n`;
  });

  // ── 5. Text formatting ──
  src = src.replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>');
  src = src.replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>');
  src = src.replace(/\\emph\{([^}]*)\}/g, '<em>$1</em>');
  src = src.replace(/\\underline\{([^}]*)\}/g, '<u>$1</u>');
  src = src.replace(/\\texttt\{([^}]*)\}/g, '<code>$1</code>');
  src = src.replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '<a href="$1" target="_blank" rel="noopener">$2</a>');

  // ── 6. Environments ──

  // Verbatim
  src = src.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_, content) => {
    return `<pre><code>${escapeHtml(content.trim())}</code></pre>`;
  });

  // Itemize
  src = src.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, content) => {
    return parseList(content, 'ul');
  });

  // Enumerate
  src = src.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, content) => {
    return parseList(content, 'ol');
  });

  // Tabular
  src = src.replace(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, (_, content) => {
    return parseTable(content);
  });

  // ── 7. Maketitle ──
  if (hasMaketitle && meta.title) {
    const titleBlock = [
      '<div class="latex-title-block">',
      `  <h1>${meta.title}</h1>`,
      meta.author ? `  <p class="latex-author">${meta.author}</p>` : '',
      meta.date ? `  <p class="latex-date">${meta.date}</p>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
    src = src.replace('%%MAKETITLE%%', titleBlock);
  } else {
    src = src.replace('%%MAKETITLE%%', '');
  }

  // ── 8. Paragraphs (double newlines) ──
  // Split by double newlines that aren't inside tags
  const blocks = src.split(/\n{2,}/);
  const htmlBlocks = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    // Don't wrap if already an HTML block element
    if (/^<(?:h[1-6]|div|ul|ol|table|pre|blockquote)/i.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed}</p>`;
  });
  src = htmlBlocks.filter(Boolean).join('\n');

  // ── 9. Restore math placeholders ──
  for (let i = 0; i < mathSlots.length; i++) {
    const math = mathSlots[i];
    // Wrap display math for styling
    if (math.startsWith('$$') || math.startsWith('\\[') || math.startsWith('\\begin{align') || math.startsWith('\\begin{equation') || math.startsWith('\\begin{gather')) {
      src = src.replace(ph(i), `<div class="latex-display-math">${math}</div>`);
    } else {
      src = src.replace(ph(i), math);
    }
  }

  // Clean up stray \\ not inside math
  src = src.replace(/<p>\s*<\/p>/g, '');

  return src;
}

function parseList(content: string, tag: 'ul' | 'ol'): string {
  const items = content.split(/\\item\s*/);
  const lis = items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `  <li>${item}</li>`)
    .join('\n');
  return `<${tag}>\n${lis}\n</${tag}>`;
}

function parseTable(content: string): string {
  // Remove \hline, split rows by \\
  const cleaned = content.replace(/\\hline/g, '').trim();
  const rows = cleaned.split(/\\\\\s*/).filter((r) => r.trim());

  const htmlRows = rows.map((row, idx) => {
    const cells = row.split('&').map((c) => c.trim());
    const cellTag = idx === 0 ? 'th' : 'td';
    const htmlCells = cells.map((c) => `    <${cellTag}>${c}</${cellTag}>`).join('\n');
    return `  <tr>\n${htmlCells}\n  </tr>`;
  });

  return `<table>\n${htmlRows.join('\n')}\n</table>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
