/**
 * SyntaxPreview — lightweight syntax highlighting for code file previews.
 * Extracted from FilesApp.tsx to reduce file size.
 */

type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'function' | 'operator' | 'plain';

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: 'text-violet-400',
  string: 'text-emerald-400',
  comment: 'text-muted-foreground/60 italic',
  number: 'text-amber-400',
  type: 'text-sky-400',
  function: 'text-blue-400',
  operator: 'text-rose-400',
  plain: 'text-foreground/90',
};

const LANG_RULES: Record<string, { keywords: string[]; types: string[]; lineComment: string; blockComment?: [string, string] }> = {
  js: { keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'default', 'new', 'this', 'async', 'await', 'try', 'catch', 'throw', 'switch', 'case', 'break', 'continue', 'typeof', 'instanceof', 'of', 'in', 'yield', 'delete', 'void', 'null', 'undefined', 'true', 'false', '=>'], types: ['string', 'number', 'boolean', 'object', 'Array', 'Promise', 'Map', 'Set'], lineComment: '//', blockComment: ['/*', '*/'] },
  py: { keywords: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False', 'self', 'async', 'await', 'global', 'nonlocal'], types: ['int', 'float', 'str', 'bool', 'list', 'dict', 'tuple', 'set', 'bytes', 'Optional'], lineComment: '#' },
  rb: { keywords: ['def', 'end', 'class', 'module', 'return', 'if', 'elsif', 'else', 'unless', 'while', 'do', 'begin', 'rescue', 'ensure', 'raise', 'yield', 'require', 'include', 'attr_accessor', 'attr_reader', 'nil', 'true', 'false', 'self', 'then', 'puts', 'print'], types: ['String', 'Integer', 'Float', 'Array', 'Hash', 'Symbol'], lineComment: '#' },
  go: { keywords: ['func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'select', 'break', 'continue', 'nil', 'true', 'false', 'make', 'new', 'append', 'len', 'cap'], types: ['int', 'int32', 'int64', 'float64', 'string', 'bool', 'byte', 'error', 'any'], lineComment: '//', blockComment: ['/*', '*/'] },
  rs: { keywords: ['fn', 'let', 'mut', 'const', 'return', 'if', 'else', 'for', 'while', 'loop', 'match', 'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'pub', 'self', 'super', 'crate', 'as', 'move', 'ref', 'async', 'await', 'true', 'false', 'Some', 'None', 'Ok', 'Err', 'where', 'type', 'unsafe'], types: ['i32', 'i64', 'u32', 'u64', 'f32', 'f64', 'bool', 'String', 'str', 'Vec', 'Option', 'Result', 'Box', 'usize'], lineComment: '//', blockComment: ['/*', '*/'] },
  css: { keywords: ['@import', '@media', '@keyframes', '@font-face', '@mixin', '@include', '@extend', '@if', '@else', '@for', '@each', '@while', '!important'], types: ['px', 'em', 'rem', '%', 'vh', 'vw', 'fr', 'auto', 'none', 'inherit', 'initial', 'flex', 'grid', 'block', 'inline', 'relative', 'absolute', 'fixed', 'sticky'], lineComment: '//', blockComment: ['/*', '*/'] },
  html: { keywords: ['DOCTYPE', 'html', 'head', 'body', 'div', 'span', 'p', 'a', 'img', 'script', 'style', 'link', 'meta', 'title', 'class', 'id', 'href', 'src', 'type', 'rel'], types: [], lineComment: '', blockComment: ['<!--', '-->'] },
  sh: { keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'exit', 'echo', 'export', 'source', 'local', 'readonly', 'set', 'unset', 'shift', 'cd', 'pwd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'sed', 'awk', 'chmod', 'chown', 'sudo', 'apt', 'npm', 'yarn', 'git', 'curl', 'wget', 'true', 'false'], types: [], lineComment: '#' },
};

const EXT_TO_LANG: Record<string, string> = {
  js: 'js', jsx: 'js', ts: 'js', tsx: 'js', mjs: 'js', cjs: 'js',
  py: 'py', rb: 'rb', go: 'go', rs: 'rs',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', xml: 'html', svg: 'html',
  sh: 'sh', bash: 'sh', zsh: 'sh',
  json: 'js', yaml: 'sh', yml: 'sh', toml: 'sh',
  java: 'js', c: 'js', cpp: 'js', h: 'js', hpp: 'js',
};

function tokenizeLine(line: string, lang: string): { text: string; type: TokenType }[] {
  const rules = LANG_RULES[lang];
  if (!rules) return [{ text: line, type: 'plain' }];

  const tokens: { text: string; type: TokenType }[] = [];
  let i = 0;

  while (i < line.length) {
    if (rules.lineComment && line.startsWith(rules.lineComment, i)) {
      tokens.push({ text: line.slice(i), type: 'comment' });
      return tokens;
    }

    if (rules.blockComment && line.startsWith(rules.blockComment[0], i)) {
      const end = line.indexOf(rules.blockComment[1], i + rules.blockComment[0].length);
      if (end !== -1) {
        tokens.push({ text: line.slice(i, end + rules.blockComment[1].length), type: 'comment' });
        i = end + rules.blockComment[1].length;
        continue;
      } else {
        tokens.push({ text: line.slice(i), type: 'comment' });
        return tokens;
      }
    }

    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      tokens.push({ text: line.slice(i, j + 1), type: 'string' });
      i = j + 1;
      continue;
    }

    if (/\d/.test(line[i]) && (i === 0 || /[\s(,=:+\-*/<>[\]{}!&|^~%]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[\d.xXa-fA-F_]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'number' });
      i = j;
      continue;
    }

    if (/[a-zA-Z_$@!]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$@!]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const nextChar = line[j] || '';

      if (rules.keywords.includes(word)) {
        tokens.push({ text: word, type: 'keyword' });
      } else if (rules.types.includes(word)) {
        tokens.push({ text: word, type: 'type' });
      } else if (nextChar === '(') {
        tokens.push({ text: word, type: 'function' });
      } else {
        tokens.push({ text: word, type: 'plain' });
      }
      i = j;
      continue;
    }

    if (/[=+\-*/<>!&|^~%?:]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[=+\-*/<>!&|^~%?:]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'operator' });
      i = j;
      continue;
    }

    tokens.push({ text: line[i], type: 'plain' });
    i++;
  }

  return tokens;
}

export const SyntaxPreview = ({ content, fileName }: { content: string; fileName: string }) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const lang = EXT_TO_LANG[ext];
  const isPlainText = !lang || ['md', 'txt', 'log', 'csv', 'env', 'ini', 'cfg'].includes(ext);

  if (ext === 'md') {
    return (
      <div className="text-[10px] font-mono leading-relaxed space-y-1">
        {content.split('\n').map((line, i) => {
          if (line.startsWith('# ')) return <div key={i} className="text-sm font-bold text-foreground mt-2">{line.slice(2)}</div>;
          if (line.startsWith('## ')) return <div key={i} className="text-xs font-bold text-foreground mt-1.5">{line.slice(3)}</div>;
          if (line.startsWith('### ')) return <div key={i} className="text-[11px] font-semibold text-foreground mt-1">{line.slice(4)}</div>;
          if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} className="text-foreground/80 pl-2">{'\u2022'} {line.slice(2)}</div>;
          if (line.startsWith('```')) return <div key={i} className="text-muted-foreground/50">{line}</div>;
          if (line.startsWith('>')) return <div key={i} className="text-muted-foreground border-l-2 border-primary/30 pl-2 ml-1">{line.slice(1).trim()}</div>;
          if (line.trim() === '') return <div key={i} className="h-2" />;
          return <div key={i} className="text-foreground/80">{line}</div>;
        })}
      </div>
    );
  }

  if (isPlainText) {
    return (
      <pre className="text-[10px] font-mono text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
        {content}
      </pre>
    );
  }

  const lines = content.split('\n');

  return (
    <div className="text-[10px] font-mono leading-relaxed">
      {lines.map((line, lineIdx) => {
        const tokens = tokenizeLine(line, lang);
        return (
          <div key={lineIdx} className="flex">
            <span className="w-7 shrink-0 text-right pr-2 text-muted-foreground/40 select-none">{lineIdx + 1}</span>
            <span className="whitespace-pre-wrap break-words">
              {tokens.map((token, tIdx) => (
                <span key={tIdx} className={TOKEN_COLORS[token.type]}>{token.text}</span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
};
