/**
 * Syntax highlighting as HTML, for the generator (build time) and the API pages (render time).
 * One rule list per language; every token class maps to a `.tok-*` rule in docs.css.
 */

export type TokenClass =
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'fn'
  | 'prop'
  | 'tag'
  | 'op';

type State = { inTag: boolean; braces: number; previous: string };

type Rule = {
  pattern: RegExp;
  cls: TokenClass | null;
  when?: (state: State) => boolean;
  keywords?: Set<string>;
};

const TS_KEYWORDS = new Set(
  (
    'import export from default function return const let var if else for while do switch case break continue new class extends ' +
    'implements interface type enum async await yield typeof instanceof in of this super null undefined true false void delete throw try catch finally ' +
    'as satisfies keyof readonly declare namespace abstract static private protected public get set is never unknown any string number boolean object symbol bigint'
  ).split(' '),
);

/** A `<` opens a JSX tag unless it directly follows an identifier or a closing bracket, where it is a generic. */
const opensTag = (state: State) =>
  !/[\w$)\]]$/.test(state.previous) || TS_KEYWORDS.has(state.previous);

const tsx: Rule[] = [
  { pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y, cls: 'comment' },
  { pattern: /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/y, cls: 'string' },
  { pattern: /<\/?[A-Za-z][\w.]*|<>|<\/>/y, cls: 'tag', when: opensTag },
  { pattern: /\/?>/y, cls: 'tag', when: (state) => state.inTag && state.braces === 0 },
  { pattern: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y, cls: 'number' },
  {
    pattern: /[A-Za-z_$][\w$-]*(?=\s*=(?!=))/y,
    cls: 'prop',
    when: (state) => state.inTag && state.braces === 0,
  },
  { pattern: /[A-Za-z_$][\w$]*(?=\s*\()/y, cls: 'fn' },
  { pattern: /[A-Za-z_$][\w$]*/y, cls: null },
  { pattern: /=>|\.\.\.|[=!<>]=?|[+\-*/%&|^~?:]/y, cls: 'op' },
  { pattern: /\s+|./y, cls: null },
];

const css: Rule[] = [
  { pattern: /\/\*[\s\S]*?\*\//y, cls: 'comment' },
  { pattern: /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/y, cls: 'string' },
  { pattern: /@[a-z-]+/y, cls: 'keyword' },
  { pattern: /#[0-9a-fA-F]{3,8}\b/y, cls: 'number' },
  { pattern: /-?\d*\.?\d+(?:px|dp|rem|em|ms|s|deg|%)?/y, cls: 'number' },
  { pattern: /--[\w-]+/y, cls: 'prop' },
  { pattern: /[\w-]+(?=\s*:)/y, cls: 'prop' },
  { pattern: /[\w-]+(?=\()/y, cls: 'fn' },
  { pattern: /[.:#]?[\w-]+(?=[^{};]*\{)|\[[^\]]*\]/y, cls: 'tag' },
  { pattern: /[\w-]+/y, cls: null },
  { pattern: /\s+|./y, cls: null },
];

const sh: Rule[] = [
  { pattern: /#[^\n]*/y, cls: 'comment' },
  { pattern: /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/y, cls: 'string' },
  {
    pattern: /[\w./-]+/y,
    cls: 'fn',
    when: (state) => /(^|\n|\||&&|;)\s*$/.test(state.previous) || state.previous === '',
  },
  { pattern: /--?[\w-]+/y, cls: 'prop' },
  { pattern: /\$\{?\w+\}?/y, cls: 'type' },
  { pattern: /[\w./-]+/y, cls: null },
  { pattern: /\s+|./y, cls: null },
];

const json: Rule[] = [
  { pattern: /"(?:[^"\\]|\\.)*"(?=\s*:)/y, cls: 'prop' },
  { pattern: /"(?:[^"\\]|\\.)*"/y, cls: 'string' },
  { pattern: /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/y, cls: 'number' },
  { pattern: /\b(?:true|false|null)\b/y, cls: 'keyword' },
  { pattern: /\s+|./y, cls: null },
];

const SWIFT_KEYWORDS = new Set(
  (
    'import func var let class struct enum protocol extension init deinit return if else guard switch case default for in while repeat do catch try throw throws rethrows async await actor ' +
    'public private fileprivate internal open static final override mutating nonmutating lazy weak unowned inout where is as any some self Self super nil true false typealias associatedtype subscript defer break continue fallthrough'
  ).split(' '),
);
const KOTLIN_KEYWORDS = new Set(
  (
    'package import fun val var class object interface data sealed enum abstract open override private protected public internal return if else when for in while do try catch finally throw ' +
    'is as null true false this super suspend lateinit by companion init constructor typealias inline crossinline noinline reified out vararg where break continue'
  ).split(' '),
);
const C_KEYWORDS = new Set(
  (
    'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while ' +
    'class namespace template typename public private protected virtual override final new delete this nullptr true false bool constexpr static_cast reinterpret_cast dynamic_cast const_cast using try catch throw noexcept explicit friend operator mutable ' +
    '#include #define #pragma #if #ifdef #ifndef #endif #import @interface @implementation @end @property @protocol @selector nil YES NO self id'
  ).split(' '),
);

function cLike(keywords: Set<string>, annotations: RegExp): Rule[] {
  const rules: Rule[] = [
    { pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y, cls: 'comment' },
    { pattern: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/y, cls: 'string' },
    { pattern: /#\s*[a-z]+/y, cls: 'keyword' },
    { pattern: annotations, cls: 'prop' },
    { pattern: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?[fFlLuU]*\b/y, cls: 'number' },
    { pattern: /[A-Za-z_$][\w$]*(?=\s*\()/y, cls: 'fn' },
    { pattern: /[A-Za-z_$@][\w$]*/y, cls: null, when: () => true },
    { pattern: /->|=>|::|[=!<>]=?|[+\-*/%&|^~?:]/y, cls: 'op' },
    { pattern: /\s+|./y, cls: null },
  ];

  return rules.map((rule) => ({ ...rule, keywords }));
}

const grammars: Record<string, Rule[]> = {
  swift: cLike(SWIFT_KEYWORDS, /@[A-Za-z]+/y),
  kotlin: cLike(KOTLIN_KEYWORDS, /@[A-Za-z]+/y),
  kt: cLike(KOTLIN_KEYWORDS, /@[A-Za-z]+/y),
  c: cLike(C_KEYWORDS, /@[a-z]+/y),
  cpp: cLike(C_KEYWORDS, /@[a-z]+/y),
  'c++': cLike(C_KEYWORDS, /@[a-z]+/y),
  objc: cLike(C_KEYWORDS, /@[a-z]+/y),
  'objective-c': cLike(C_KEYWORDS, /@[a-z]+/y),
  h: cLike(C_KEYWORDS, /@[a-z]+/y),
  mm: cLike(C_KEYWORDS, /@[a-z]+/y),
  tsx,
  ts: tsx,
  jsx: tsx,
  js: tsx,
  javascript: tsx,
  typescript: tsx,
  css,
  sh,
  bash: sh,
  shell: sh,
  zsh: sh,
  console: sh,
  json,
  jsonc: json,
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function classify(rule: Rule, text: string, state: State): TokenClass | null {
  if (rule.cls !== null) return rule.cls;
  if (!/^[A-Za-z_$]/.test(text)) return null;
  if ((rule.keywords ?? TS_KEYWORDS).has(text)) return 'keyword';
  if (/^[A-Z][\w$]*$/.test(text) && !state.previous.endsWith('.')) return 'type';

  return null;
}

export type Token = { cls: TokenClass | null; text: string };

/** The code as tokens, in order; unknown languages give one untyped token. */
export function tokenize(code: string, lang: string | undefined): Token[] {
  const rules = lang ? grammars[lang.toLowerCase()] : undefined;

  if (!rules) return [{ cls: null, text: code }];

  const state: State = { inTag: false, braces: 0, previous: '' };
  const tokens: Token[] = [];
  let index = 0;

  while (index < code.length) {
    let matched = false;

    for (const rule of rules) {
      if (rule.when && !rule.when(state)) continue;
      rule.pattern.lastIndex = index;

      const match = rule.pattern.exec(code);

      if (!match || match[0].length === 0) continue;

      const text = match[0];
      const cls = classify(rule, text, state);

      tokens.push({ cls, text });

      if (cls === 'tag') {
        state.inTag = !text.endsWith('>');
        state.braces = 0;
      } else if (state.inTag && cls === null) {
        if (text === '{') state.braces += 1;
        else if (text === '}') state.braces -= 1;
      }

      if (!/^\s+$/.test(text)) state.previous = text;
      else state.previous = state.previous + (text.includes('\n') ? '\n' : '');

      index += text.length;
      matched = true;
      break;
    }

    if (!matched) {
      tokens.push({ cls: null, text: code[index] });
      index += 1;
    }
  }

  return tokens;
}

/** Returns escaped HTML with one `<span class="tok-*">` per classified token. */
export function highlight(code: string, lang: string | undefined): string {
  return tokenize(code, lang)
    .map((token) =>
      token.cls
        ? `<span class="tok-${token.cls}">${escapeHtml(token.text)}</span>`
        : escapeHtml(token.text),
    )
    .join('');
}
