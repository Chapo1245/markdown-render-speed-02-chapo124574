// MarkSwift: a fast drop-in renderer producing exactly marked 18.1.3's HTML
// (GFM on, default options). Written fresh from the CommonMark 0.31.2 / GFM
// 0.29 specs and marked's observable behaviour on the practice set.
// Single module: block parser builds a small tree, inline parser renders it.

// ---------------------------------------------------------------- utilities

const PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
function isPunct(ch) { return ch.length === 1 && PUNCT.has(ch); }
// Unicode punctuation / whitespace tests (spec flanking rules use these).
// CommonMark punctuation = ASCII punct + Unicode P (punctuation) or S
// (symbol) classes, so currency symbols like £/€ count as punctuation.
const RE_PUNCT = /[\p{P}\p{S}]/u;
const RE_WS = /\s/;
function isPunctU(ch) { return ch.length === 1 && (PUNCT.has(ch) || RE_PUNCT.test(ch)); }
function isWS(ch) { return ch.length === 1 && RE_WS.test(ch); }
function isAlphaNum(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

// Escape text for HTML output. `&` is escaped unless it starts a valid
// entity reference (&name; &#12; &#x1f;) which is copied verbatim (marked
// passes named entities through untouched; numeric ones are decoded earlier).
function escText(s) {
  if (s.indexOf('&') === -1 && s.indexOf('<') === -1 && s.indexOf('>') === -1 &&
      s.indexOf('"') === -1 && s.indexOf("'") === -1) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '&') {
      const m = entRefAt(s, i);
      if (m > 0) { out += s.slice(i, i + m); i += m - 1; continue; }
      out += '&amp;';
    } else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch === "'") out += '&#39;';
    else out += ch;
  }
  return out;
}

// Escape for an attribute value (href / title / alt). Same entity rule.
function escAttr(s) {
  if (s.indexOf('&') === -1 && s.indexOf('"') === -1 && s.indexOf('<') === -1 &&
      s.indexOf('>') === -1) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '&') {
      const m = entRefAt(s, i);
      if (m > 0) { out += s.slice(i, i + m); i += m - 1; continue; }
      out += '&amp;';
    } else if (ch === '"') out += '&quot;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else out += ch;
  }
  return out;
}

// Length of an entity reference starting at s[i] ('&'), or 0 if none.
// Named: & + alphanumerics + ';'  (passed through verbatim by marked)
// Numeric: &#digits;  &#x hex;  &#X hex;  (decoded by the caller)
function entRefAt(s, i) {
  if (s[i] !== '&') return 0;
  let j = i + 1;
  if (s[j] === '#') {
    j++;
    if (s[j] === 'x' || s[j] === 'X') {
      j++;
      const st = j;
      while (j < s.length && isHex(s[j])) j++;
      // Hex numeric entities allow at most 6 digits.
      if (j === st || j - st > 6 || s[j] !== ';') return 0;
      return j - i + 1;
    }
    const st = j;
    while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
    // Decimal numeric entities allow at most 7 digits.
    if (j === st || j - st > 7 || s[j] !== ';') return 0;
    return j - i + 1;
  }
  const st = j;
  while (j < s.length && isAlphaNum(s[j])) j++;
  if (j === st || s[j] !== ';') return 0;
  return j - i + 1;
}
function isHex(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

// Decode a numeric entity reference (s[i..i+len) is '&#...;'). Returns the
// replacement character for 0, surrogates and out-of-range values.
function decodeNumeric(s, i, len) {
  let v = 0;
  let big = false;
  if (s[i + 2] === 'x' || s[i + 2] === 'X') {
    for (let k = i + 3; k < i + len - 1; k++) {
      v = v * 16 + parseInt(s[k], 16);
      if (v > 0x10FFFF) { big = true; break; }
    }
  } else {
    for (let k = i + 2; k < i + len - 1; k++) {
      v = v * 10 + (s.charCodeAt(k) - 48);
      if (v > 0x10FFFF) { big = true; break; }
    }
  }
  if (big || v === 0 || v > 0x10FFFF || (v >= 0xD800 && v <= 0xDFFF)) return '�';
  return String.fromCodePoint(v);
}

// Resolve backslash escapes in a plain string (used for link destinations,
// titles and labels). Entities are left exactly as written: marked does not
// decode them in destinations, titles or labels.
function resolveEscapes(s) {
  if (s.indexOf('\\') === -1) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && isPunct(s[i + 1])) { out += s[i + 1]; i++; }
    else out += ch;
  }
  return out;
}

// Plain HTML escape for text and code spans: every & < > " ' is escaped.
function escPlain(s) {
  if (s.indexOf('&') === -1 && s.indexOf('<') === -1 && s.indexOf('>') === -1 &&
      s.indexOf('"') === -1 && s.indexOf("'") === -1) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch === "'") out += '&#39;';
    else out += ch;
  }
  return out;
}
// href percent-encoding exactly like marked: encodeURI, except a literal '%'
// is left alone (encodeURI would turn it into %25).
function encHref(s) {
  const e = encodeURI(s);
  return e.indexOf('%25') < 0 ? e : e.replace(/%25/g, '%');
}

// Normalise a link label: collapse whitespace runs to one space, trim, and
// Unicode case-fold (with the special folds the spec examples need).
function foldLabel(raw) {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.toLowerCase();
  // Full case folding for characters toLowerCase() misses.
  if (s.indexOf('ß') !== -1) s = s.replace(/ß/g, 'ss');
  if (s.indexOf('ẞ') !== -1) s = s.replace(/ẞ/g, 'ss');
  if (s.indexOf('ﬀ') !== -1) s = s.replace(/ﬀ/g, 'ff');
  if (s.indexOf('ﬁ') !== -1) s = s.replace(/ﬁ/g, 'fi');
  if (s.indexOf('ﬂ') !== -1) s = s.replace(/ﬂ/g, 'fl');
  if (s.indexOf('ﬃ') !== -1) s = s.replace(/ﬃ/g, 'ffi');
  if (s.indexOf('ﬄ') !== -1) s = s.replace(/ﬄ/g, 'ffl');
  if (s.indexOf('ﬅ') !== -1) s = s.replace(/ﬅ/g, 'st');
  if (s.indexOf('ﬆ') !== -1) s = s.replace(/ﬆ/g, 'st');
  if (s.indexOf('İ') !== -1) s = s.replace(/İ/g, 'i̇');
  return s;
}

// Column-aware helpers for tabs (a tab advances to the next multiple of 4).
function colOf(s, upTo) {
  let col = 0;
  for (let i = 0; i < upTo && i < s.length; i++) {
    col += s[i] === '\t' ? 4 - (col % 4) : 1;
  }
  return col;
}
// Text of line s starting at column col. The leading whitespace is expanded
// to spaces using the original columns, so a tab after the cut keeps the
// width it had in the original line. Tabs after the first non-whitespace
// character are left alone.
function sliceCol(s, col) {
  if (col <= 0) return s;
  let c = 0;
  let i = 0;
  let out = '';
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) {
    if (s[i] === ' ') {
      if (c >= col) out += ' ';
      c++;
      i++;
    } else {
      const next = c + (4 - (c % 4));
      if (next > col) out += ' '.repeat(next - Math.max(c, col));
      c = next;
      i++;
    }
  }
  return out + s.slice(i);
}
// Strip up to `col` columns of leading whitespace from s, preserving tabs
// that start at or after the cut (unlike sliceCol, which expands them).
// A tab straddling the cut is replaced by spaces for its remainder.
function stripIndentKeepTabs(s, col) {
  let i = 0, c = 0;
  while (i < s.length && c < col) {
    const ch = s[i];
    if (ch === ' ') { c++; i++; }
    else if (ch === '\t') {
      const next = c + (4 - (c % 4));
      if (next <= col) { c = next; i++; }
      else return ' '.repeat(next - col) + s.slice(i + 1);
    } else break;
  }
  return s.slice(i);
}
// Number of leading-whitespace columns of s.
function indentCols(s) {
  let col = 0, i = 0;
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) {
    col += s[i] === '\t' ? 4 - (col % 4) : 1;
    i++;
  }
  return col;
}

// ---------------------------------------------------------------- inline
// Node kinds: x=text, r=raw verbatim, c=code span, d=delimiter, b=hard break,
// a=link, i=image, l=autolink, e=em/strong/del wrapper.
// Delimiter node: {t:'d', ch, n, orig, o, c}  (o=canOpen, c=canClose)

// Parse a link/image starting at src[i] ('[' or '!['). Returns null or
// {end, href, title, ts, te} where [ts,te) is the link-text source range.
function tryLink(src, i, isImg, refs) {
  const n = src.length;
  const close = findClose(src, i + 1, isImg, refs);
  if (close < 0) return null;
  const after = close + 1;
  // inline (dest "title"); if the destination is invalid, fall through to
  // the shortcut reference form (the [text] alone may be a defined ref).
  if (src[after] === '(') {
    const r = parseInlineDest(src, after);
    if (r) return { end: r.end, href: r.href, title: r.title, ts: i + 1, te: close, isImage: isImg };
  }
  // full reference [label]
  if (src[after] === '[') {
    if (src[after + 1] === ']') {
      const rawText = src.slice(i + 1, close);
      const key = foldLabel(rawText);
      if (key.length === 0) return null;
      const ref = refs.get(key);
      if (!ref) return null;
      return { end: after + 2, href: ref.href, title: ref.title, ts: i + 1, te: close, isImage: isImg };
    }
    const lab = scanLabel(src, after + 1);
    if (lab !== null) {
      // A present but undefined label does NOT fall through to the shortcut:
      // [foo][bar] with bar undefined leaves [foo] literal (a later
      // [bar][baz] may still form). Only a malformed label falls through.
      const key = foldLabel(lab.text);
      if (key.length === 0) return null;
      const ref = refs.get(key);
      if (!ref) return null;
      return { end: lab.end, href: ref.href, title: ref.title, ts: i + 1, te: close, isImage: isImg };
    }
    // not a defined reference: fall through to the shortcut form below
  }
  // shortcut: the link text itself is the label (compared raw: backslash
  // escapes in a label do NOT resolve for lookup, so [foo\!] != [foo!]).
  const rawText = src.slice(i + 1, close);
  const key = foldLabel(rawText);
  if (key.length === 0) return null;
  const ref = refs.get(key);
  if (!ref) return null;
  return { end: after, href: ref.href, title: ref.title, ts: i + 1, te: close, isImage: isImg };
}

// Scan a link label starting at src[i] (just after '['). Returns
// {text, end} (end = index just past ']') or null. Labels may not contain
// an unescaped '[' and may not contain a raw ']' except as the terminator.
function scanLabel(src, i) {
  const n = src.length;
  let j = i;
  while (j < n) {
    const ch = src[j];
    if (ch === '\\' && j + 1 < n && isPunct(src[j + 1])) { j += 2; continue; }
    if (ch === '[') return null;
    if (ch === ']') return { text: src.slice(i, j), end: j + 1 };
    j++;
  }
  return null;
}

// Find the ']' closing the bracket opened at src[openIdx-1] (openIdx is the
// index just after '['). Depth counts nested '['; code spans and escapes are
// skipped. For a link opener (not image), a ']' that would close an inner
// link opener and is followed by a valid link suffix aborts the outer link
// (links cannot contain links); images may contain links in their alt text.
function findClose(src, i, isImg, refs) {
  const n = src.length;
  let depth = 1;
  // stack of openers: {pos, isImg} for the outer opener then inner ones.
  const stack = [{ pos: i - 1, isImg }];
  let j = i;
  while (j < n) {
    const ch = src[j];
    if (ch === '\\' && j + 1 < n && isPunct(src[j + 1])) { j += 2; continue; }
    if (ch === '`') {
      const run = countRun(src, j, '`');
      const end = findCodeEnd(src, j + run, run);
      if (end >= 0) { j = end + run; continue; }
      j += run; continue;
    }
    if (ch === '<') {
      // An angle autolink or raw HTML tag swallows its contents, including
      // any ']' inside it, so it cannot close the link text.
      const auto = matchAngleAutolink(src, j);
      if (auto !== null) { j += auto.text.length + 2; continue; }
      const tag = matchRawHtml(src, j);
      if (tag !== null) { j += tag.length; continue; }
      j++; continue;
    }
    if (ch === '[') {
      depth++;
      stack.push({ pos: j, isImg: src[j - 1] === '!' });
      j++; continue;
    }
    if (ch === ']') {
      depth--;
      if (depth === 0) return j;
      const inner = stack.pop();
      if (!isImg && !inner.isImg) {
        // Would this ']' close an inner link? If the inner opener forms
        // a link, the outer link attempt aborts. The inner form depends
        // on its suffix: inline dest, full ref (defined label only),
        // collapsed [] (text label defined), or shortcut (text defined).
        const nxt = src[j + 1];
        let aborts = false;
        if (nxt === '(') aborts = linkSuffixForms(src, j + 1, refs);
        else if (nxt === '[') {
          if (src[j + 2] === ']') aborts = refs.has(foldLabel(src.slice(inner.pos + 1, j)));
          else aborts = linkSuffixForms(src, j + 1, refs);
        } else aborts = refs.has(foldLabel(src.slice(inner.pos + 1, j)));
        if (aborts) return -1;
      }
      j++; continue;
    }
    j++;
  }
  return -1;
}

// Does a link suffix starting at src[i] (just after ']') form a valid link
// for some opener? Used by the inner-link abort check.
function linkSuffixForms(src, i, refs) {
  const n = src.length;
  if (i >= n) return false;
  if (src[i] === '(') return parseInlineDest(src, i) !== null;
  if (src[i] === '[') {
    if (src[i + 1] === ']') return false; // collapsed: label unknown here
    const lab = scanLabel(src, i + 1);
    if (lab === null) return false;
    const key = foldLabel(lab.text);
    return key.length > 0 && refs.has(key);
  }
  return false;
}

// Parse '(dest "title")' starting at src[i] == '('. Returns
// {end, href, title} (end = index just past ')') or null.
function parseInlineDest(src, i) {
  const n = src.length;
  let j = i + 1;
  j = skipWS(src, j);
  if (j >= n) return null;
  let href = '';
  if (src[j] === '<') {
    // angle destination: no line endings, no '<', '\>' escapes allowed
    let k = j + 1, out = '';
    let ok = false;
    while (k < n) {
      const ch = src[k];
      if (ch === '\n' || ch === '<') return null;
      if (ch === '>') { ok = true; break; }
      if (ch === '\\' && k + 1 < n && isPunct(src[k + 1])) { out += src[k + 1]; k += 2; continue; }
      out += ch; k++;
    }
    if (!ok) return null;
    href = resolveEscapes(out);
    j = k + 1;
  } else {
    // bare destination: no spaces/controls, balanced parens
    let k = j, depth = 0, out = '';
    let end = -1;
    while (k < n) {
      const ch = src[k];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch.charCodeAt(0) < 32) break;
      if (ch === '\\' && k + 1 < n && isPunct(src[k + 1])) { out += src[k + 1]; k += 2; continue; }
      if (ch === '(') { depth++; out += ch; k++; continue; }
      if (ch === ')') {
        if (depth === 0) { end = k; break; }
        depth--; out += ch; k++; continue;
      }
      out += ch; k++;
    }
    if (end === -1 && depth > 0) return null;
    if (end === -1) {
      // destination ended at whitespace: dest is out, then title / ')'
      href = resolveEscapes(out);
      j = k;
    } else {
      href = resolveEscapes(out);
      return { end: end + 1, href, title: null };
    }
  }
  // optional title, then ')'
  j = skipWS(src, j);
  if (j < n && src[j] === ')') return { end: j + 1, href, title: null };
  let title = null;
  if (j < n && (src[j] === '"' || src[j] === "'" || src[j] === '(')) {
    const q = src[j];
    const closeCh = q === '(' ? ')' : q;
    let k = j + 1, out = '', ok = false, depth = q === '(' ? 1 : 0;
    while (k < n) {
      const ch = src[k];
      if (ch === '\\' && k + 1 < n && isPunct(src[k + 1])) { out += src[k + 1]; k += 2; continue; }
      if (q === '(' && ch === '(') { depth++; out += ch; k++; continue; }
      if (ch === closeCh) {
        if (q === '(') { depth--; if (depth === 0) { ok = true; break; } out += ch; k++; continue; }
        ok = true; break;
      }
      out += ch; k++;
    }
    if (!ok) return null;
    title = resolveEscapes(out);
    j = k + 1;
    j = skipWS(src, j);
  }
  if (j < n && src[j] === ')') return { end: j + 1, href, title };
  return null;
}

function skipWS(src, i) {
  while (i < src.length && (src[i] === ' ' || src[i] === '\t' || src[i] === '\n' || src[i] === '\r')) i++;
  return i;
}
function countRun(src, i, ch) {
  let k = i;
  while (k < src.length && src[k] === ch) k++;
  return k - i;
}
// Index of the closing backtick run of exactly `len` backticks starting the
// search at src[i]; -1 if none. A longer run does not close.
function findCodeEnd(src, i, len) {
  const n = src.length;
  let j = i;
  while (j < n) {
    if (src[j] === '`') {
      const run = countRun(src, j, '`');
      if (run === len) return j;
      j += run;
    } else j++;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Raw HTML matcher: comment, PI, declaration, CDATA, close tag, open tag.
// Returns the tag text, or null. All rules verified against the reference.
function matchRawHtml(src, i) {
  if (src[i] !== '<') return null;
  const n = src.length;
  let j = i + 1;
  // Comment <!-- ... -->. Abrupt closings <!--> and <!---> are complete
  // comments (inline); otherwise the comment ends at the first -->.
  if (src.startsWith('<!--', i)) {
    if (src.startsWith('<!-->', i)) return '<!-->';
    if (src.startsWith('<!--->', i)) return '<!--->';
    const k = src.indexOf('-->', i + 4);
    if (k === -1) return null;
    return src.slice(i, k + 3);
  }
  // Processing instruction <? ... ?>
  if (src.startsWith('<?', i)) {
    const k = src.indexOf('?>', i + 2);
    if (k === -1) return null;
    return src.slice(i, k + 2);
  }
  // Declaration <!A ... >  (letter after !)
  if (src.startsWith('<!', i)) {
    if (/[A-Za-z]/.test(src[i + 2] || '')) {
      const k = src.indexOf('>', i + 3);
      if (k === -1) return null;
      return src.slice(i, k + 1);
    }
    if (src.startsWith('<![CDATA[', i)) {
      const k = src.indexOf(']]>', i + 9);
      if (k === -1) return null;
      return src.slice(i, k + 3);
    }
    return null;
  }
  // Close tag </name ...>
  if (src[i + 1] === '/') {
    j = i + 2;
    if (!/[A-Za-z]/.test(src[j] || '')) return null;
    while (j < n && /[A-Za-z0-9-]/.test(src[j])) j++;
    while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
    if (src[j] !== '>') return null;
    return src.slice(i, j + 1);
  }
  // Open tag <name [attr ...] [ / ]>. Tag name: [A-Za-z][A-Za-z0-9-]*.
  // After the name the next char must be whitespace, / or >.
  if (!/[A-Za-z]/.test(src[i + 1] || '')) return null;
  j = i + 1;
  while (j < n && /[A-Za-z0-9-]/.test(src[j])) j++;
  if (j < n && src[j] !== ' ' && src[j] !== '\t' && src[j] !== '\n' && src[j] !== '\r' &&
      src[j] !== '/' && src[j] !== '>') return null;
  while (true) {
    // Skip whitespace.
    while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
    if (j >= n) return null;
    const c = src[j];
    if (c === '/') {
      if (src[j + 1] === '>') return src.slice(i, j + 2);
      return null;
    }
    if (c === '>') return src.slice(i, j + 1);
    // Attribute name (XML Name): [A-Za-z_:][A-Za-z0-9_.:-]*
    const aStart = j;
    if (!/[A-Za-z_:]/.test(src[j] || '')) return null;
    j++;
    while (j < n && /[A-Za-z0-9_.:-]/.test(src[j])) j++;
    if (j === aStart) return null;
    // Optional whitespace, optional = value.
    while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
    if (src[j] === '=') {
      j++;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
      if (j >= n) return null;
      const q = src[j];
      if (q === '"' || q === "'") {
        const k = src.indexOf(q, j + 1);
        if (k === -1) return null;
        j = k + 1;
      } else {
        const vStart = j;
        while (j < n) {
          const d = src[j];
          if (d === ' ' || d === '\t' || d === '\n' || d === '\r' || d === '"' || d === "'" ||
              d === '=' || d === '<' || d === '>' || d === '`') break;
          j++;
        }
        if (j === vStart) return null;
      }
      // After a value, the next char must be whitespace, / or >.
      if (j < n) {
        const d = src[j];
        if (d !== ' ' && d !== '\t' && d !== '\n' && d !== '\r' && d !== '/' && d !== '>') return null;
      }
    }
  }
}

// <...> autolink: <scheme:...> or <email> (email domain needs a dot).
// Returns {href, text} or null.
function matchAngleAutolink(src, i) {
  if (src[i] !== '<') return null;
  const n = src.length;
  let j = i + 1;
  let k = j;
  while (k < n && src[k] !== '>' && src[k] !== ' ' && src[k] !== '\t' && src[k] !== '\n' && src[k] !== '\r' && src[k] !== '<') k++;
  if (k >= n || src[k] !== '>') return null;
  const inner = src.slice(j, k);
  if (inner.length === 0) return null;
  const colon = inner.indexOf(':');
  if (colon > 0 && colon <= 32 && /^[A-Za-z][A-Za-z0-9+.-]*$/.test(inner.slice(0, colon))) {
    if (/^[A-Za-z][A-Za-z0-9+.-]{1,31}$/.test(inner.slice(0, colon)) && inner.slice(colon + 1).length > 0) {
      return { href: inner, text: inner };
    }
    return null;
  }
  const at = inner.indexOf('@');
  if (at > 0) {
    const local = inner.slice(0, at);
    const dom = inner.slice(at + 1);
    if (/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(local) && isValidDomain(dom, true)) {
      return { href: 'mailto:' + inner, text: inner };
    }
  }
  return null;
}

// Validate a domain: labels of alnum with interior hyphens, joined by dots.
// needDot: require at least two labels (one dot).
function isValidDomain(dom, needDot) {
  if (dom.length === 0) return false;
  const labels = dom.split('.');
  if (needDot && labels.length < 2) return false;
  for (const lab of labels) {
    if (lab.length === 0 || lab.length > 63) return false;
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(lab)) return false;
  }
  return true;
}

function isAlnum(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}

// Case-insensitive match of http://, https://, ftp:// at src[i].
// Returns the scheme length (7, 8, or 6) or 0.
function schemeLenCI(src, i) {
  const s = src.slice(i, i + 8).toLowerCase();
  if (s.startsWith('https://')) return 8;
  if (s.startsWith('http://')) return 7;
  if (s.startsWith('ftp://')) return 6;
  return 0;
}

// Scan a www/scheme URL starting at i. Returns the end index (exclusive) of
// the URL, or -1 if there is no valid URL here. Domain rule (probed): the
// first char after the prefix must be [A-Za-z0-9-]; the rest is a run of
// [A-Za-z0-9_.-] and then any URL chars until whitespace, <, >, backtick or
// an entity start.
function matchExtUrl(src, i, isWww) {
  const n = src.length;
  let prefixEnd;
  if (isWww) {
    if (!src.startsWith('www.', i)) return -1;
    prefixEnd = i + 4;
  } else {
    const scheme = schemeLenCI(src, i);
    if (scheme === 0) return -1;
    prefixEnd = i + scheme;
  }
  const c0 = src[prefixEnd];
  if (c0 === undefined || !(isAlnum(c0) || c0 === '-')) return -1;
  // URL scan: every char until whitespace, <, >, backtick, or an entity start.
  let j = prefixEnd + 1;
  while (j < n) {
    const c = src[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '<' || c === '>' || c === '`') break;
    if (c === '&') {
      const m = entRefAt(src, j);
      if (m > 0) break;
    }
    j++;
  }
  let end = j;
  // Truncate at a '(' that has no ')' after it anywhere in the candidate.
  const lastClose = src.lastIndexOf(')', end - 1);
  let firstBadOpen = -1;
  for (let p = i; p < end; p++) {
    if (src[p] === '(' && (lastClose === -1 || p > lastClose)) { firstBadOpen = p; break; }
  }
  if (firstBadOpen !== -1) end = firstBadOpen;
  // Strip trailing punctuation and unmatched ')'s (keep at least 1 domain char).
  const minEnd = prefixEnd + 1;
  while (end > minEnd) {
    const last = src[end - 1];
    if (last === ')' ) {
      let bal = 0, mp = -1;
      for (let p = end - 1; p >= i; p--) {
        if (src[p] === ')') bal++;
        else if (src[p] === '(') {
          bal--;
          if (bal === 0) { mp = p; break; }
        }
      }
      if (mp === -1) { end--; continue; }
      let nested = false;
      for (let p = mp + 1; p < end - 1; p++) if (src[p] === '(') { nested = true; break; }
      if (nested) { end--; continue; }
      break;
    }
    if (last === '?' || last === '!' || last === '.' || last === ',' || last === ':' ||
        last === ';' || last === '*' || last === '_' || last === '~' ||
        last === "'" || last === '"') { end--; continue; }
    break;
  }
  if (end <= minEnd) return -1;
  return end;
}

// Scan an email address starting at i (i is the first char of the local
// part). Returns the end index, or -1. Local part: [A-Za-z0-9._+-]+.
// Domain: labels of [A-Za-z0-9_-]+ joined by single dots, at least two
// labels, and the domain must not end with '-' or '_'.
function matchEmail(src, i) {
  const n = src.length;
  let j = i;
  while (j < n && isLocalChar(src[j])) j++;
  if (j === i || j >= n || src[j] !== '@') return -1;
  let labels = 0;
  let k = j + 1;
  while (true) {
    const c = src[k];
    if (c === undefined || !(isAlnum(c) || c === '_' || c === '-')) return -1;
    while (k < n && (isAlnum(src[k]) || src[k] === '_' || src[k] === '-')) k++;
    labels++;
    if (src[k] === '.' && k + 1 < n && (isAlnum(src[k + 1]) || src[k + 1] === '_' || src[k + 1] === '-')) { k++; continue; }
    break;
  }
  if (labels < 2) return -1;
  const lastDom = src[k - 1];
  if (lastDom === '-' || lastDom === '_') return -1;
  return k;
}
function isLocalChar(c) {
  return isAlnum(c) || c === '.' || c === '_' || c === '+' || c === '-';
}

// ---------------------------------------------------------------------------
// Flanking for a delimiter run starting at i (length run, char ch).
function flankInfo(src, i, run) {
  const before = i === 0 ? '\n' : src[i - 1];
  const after = i + run >= src.length ? '\n' : src[i + run];
  const beforeWS = isWS(before);
  const afterWS = isWS(after);
  const beforePunct = isPunctU(before);
  const afterPunct = isPunctU(after);
  const leftFlank = !afterWS && (!afterPunct || beforeWS || beforePunct);
  const rightFlank = !beforeWS && (!beforePunct || afterWS || afterPunct);
  return { leftFlank, rightFlank, before, after };
}
function canOpen(src, i, run, ch) {
  const f = flankInfo(src, i, run);
  if (ch === '_') return f.leftFlank && (!f.rightFlank || isPunctU(f.before));
  return f.leftFlank;
}
function canClose(src, i, run, ch) {
  const f = flankInfo(src, i, run);
  if (ch === '_') return f.rightFlank && (!f.leftFlank || isPunctU(f.after));
  return f.rightFlank;
}

// Plain text of inline nodes (for image alt attributes). Named entities are
// kept as text; raw HTML tags are dropped; nested images give their alt.
function altText(nodes) {
  let out = '';
  for (const nd of nodes) {
    if (nd.t === 'x') out += nd.s;
    else if (nd.t === 'r') { if (nd.s[0] === '&') out += nd.s; }
    else if (nd.t === 'c') out += nd.s;
    else if (nd.t === 'b') out += '\n';
    else if (nd.t === 'd') out += nd.ch.repeat(nd.n);
    else if (nd.t === 'a') out += altText(nd.ch);
    else if (nd.t === 'i') out += nd.alt;
    else if (nd.t === 'l') out += nd.text;
    else if (nd.t === 'e') out += altText(nd.ch);
  }
  return out;
}

function unlinkDelim(d) {
  if (d.dp) d.dp.dn = d.dn;
  if (d.dn) d.dn.dp = d.dp;
  d.dp = d.dn = null;
}

// Emphasis / strong / strikethrough over the delimiter list. Forward order,
// leftover closers are re-processed, multiple-of-3 uses ORIGINAL lengths.
// Blocker rule: when a can-both closer matches a canOpen-only opener and
// the nearest earlier opener has a different original length, that earlier
// opener is blocked for the next closer whose use equals the match's use.
function processEmphasis(nodes, delims) {
  if (delims.length === 0) return;
  for (let k = 0; k < delims.length; k++) {
    delims[k].dp = k > 0 ? delims[k - 1] : null;
    delims[k].dn = k < delims.length - 1 ? delims[k + 1] : null;
  }
  let blocked = null;
  let blockUse = 0;
  let cur = delims[0];
  while (cur) {
    if (!cur.c || cur.n === 0) { cur = cur.dn; continue; }
    let cand = cur.dp;
    let opener = null;
    while (cand) {
      if (cand.ch === cur.ch && cand.o && cand.n > 0 && !cand.enclosed) {
        // Strikethrough needs matching run lengths.
        if (cur.ch === '~' && cand.n !== cur.n) { cand = cand.dp; continue; }
        if (((cand.o && cand.c) || (cur.o && cur.c)) &&
            (cand.orig + cur.orig) % 3 === 0 &&
            !(cand.orig % 3 === 0 && cur.orig % 3 === 0)) {
          cand = cand.dp; continue;
        }
        // Blocked opener: a can-both closer that formed emphasis taints
        // the nearest earlier opener; the next closer skips it entirely
        // (regardless of use) and tries a farther opener.
        if (cand === blocked) {
          blocked = null; blockUse = 0;
          cand = cand.dp; continue;
        }
        opener = cand; break;
      }
      cand = cand.dp;
    }
    if (!opener) {
      cur = cur.dn; continue;
    }
    const use = cur.ch === '~' ? cur.n : (opener.n >= 2 && cur.n >= 2 ? 2 : 1);
    const tag = cur.ch === '~' ? 'del' : (use === 2 ? 'strong' : 'em');
    const oi = nodes.indexOf(opener);
    const ci = nodes.indexOf(cur);
    if (oi === -1 || ci === -1 || oi >= ci) { cur = cur.dn; continue; }
    // Delimiters strictly between the opener and closer are now enclosed
    // in this emphasis element: a later closer outside it cannot match
    // them (they stay literal unless matched from inside, which happens
    // before this pair forms because closers run in forward order).
    for (let d = opener.dn; d && d !== cur; d = d.dn) d.enclosed = true;
    // Emphasis formed at a different opener clears a pending blocker
    // (set by an earlier match).
    if (blocked && opener !== blocked) { blocked = null; blockUse = 0; }
    // Set a blocker when a can-both closer matches a canOpen-only opener
    // and the nearest earlier opener has a different original length.
    if (cur.o && cur.c && opener.o && !opener.c) {
      let outer = opener.dp;
      while (outer) {
        if (outer.ch === opener.ch && outer.o && outer.n > 0) break;
        outer = outer.dp;
      }
      if (outer && outer.orig !== opener.orig) {
        blocked = outer;
        blockUse = use;
      }
    }
    const inner = nodes.slice(oi + 1, ci);
    const eNode = { t: 'e', tag, ch: inner };
    opener.n -= use;
    cur.n -= use;
    const seg = [];
    if (opener.n > 0) seg.push(opener);
    seg.push(eNode);
    if (cur.n > 0) seg.push(cur);
    nodes.splice(oi, ci - oi + 1, ...seg);
    if (opener.n === 0) unlinkDelim(opener);
    if (cur.n === 0) {
      const nxt = cur.dn;
      unlinkDelim(cur);
      cur = nxt;
    }
    // else: closer has leftover length; re-process it (stay on cur).
  }
}

// Render inline nodes to HTML.
function renderNodes(nodes) {
  let out = '';
  for (const nd of nodes) {
    if (nd.t === 'x') out += escPlain(nd.s);
    else if (nd.t === 'r') out += nd.s;
    else if (nd.t === 'c') out += '<code>' + escPlain(nd.s) + '</code>';
    else if (nd.t === 'b') out += '<br>';
    else if (nd.t === 'd') out += nd.ch.repeat(nd.n);
    else if (nd.t === 'a') {
      out += '<a href="' + escAttr(encHref(nd.href)) + '"';
      if (nd.title !== null && nd.title !== undefined) out += ' title="' + escAttr(nd.title) + '"';
      out += '>' + renderNodes(nd.ch) + '</a>';
    } else if (nd.t === 'i') {
      out += '<img src="' + escAttr(encHref(nd.src)) + '" alt="' + escAttr(nd.alt) + '"';
      if (nd.title !== null && nd.title !== undefined) out += ' title="' + escAttr(nd.title) + '"';
      out += '>';
    } else if (nd.t === 'l') {
      out += '<a href="' + escPlain(encHref(nd.href)) + '">' + escPlain(nd.text) + '</a>';
    } else if (nd.t === 'e') {
      out += '<' + nd.tag + '>' + renderNodes(nd.ch) + '</' + nd.tag + '>';
    }
  }
  return out;
}

// The inline scanner. Returns the node list for src (refs = link ref map).
// When noExt is true (link/image text), extended autolinks (www/scheme/
// email) are not created; <> autolinks still are.
function scanInline(src, refs, noExt) {
  const nodes = [];
  const delims = [];
  let buf = '';
  let i = 0;
  const n = src.length;
  function flush() { if (buf) { nodes.push({ t: 'x', s: buf }); buf = ''; } }
  while (i < n) {
    const ch = src[i];
    if (ch === '\\') {
      if (src[i + 1] === '\n') {
        flush(); nodes.push({ t: 'b' }); i += 2;
        while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
        continue;
      }
      if (i + 1 < n && isPunct(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
      buf += '\\'; i++; continue;
    }
    if (ch === '`') {
      const run = countRun(src, i, '`');
      const end = findCodeEnd(src, i + run, run);
      if (end !== -1) {
        let content = src.slice(i + run, end).replace(/\n/g, ' ');
        if (content.length >= 2 && content[0] === ' ' && content[content.length - 1] === ' ' &&
            content.trim().length > 0) content = content.slice(1, -1);
        flush(); nodes.push({ t: 'c', s: content }); i = end + run; continue;
      }
      buf += '`'.repeat(run); i += run; continue;
    }
    if (ch === '<') {
      const al = matchAngleAutolink(src, i);
      if (al) {
        flush(); nodes.push({ t: 'l', href: al.href, text: al.text });
        i += al.text.length + 2; continue;
      }
      const tag = matchRawHtml(src, i);
      if (tag !== null) {
        flush(); nodes.push({ t: 'r', s: tag });
        if (/^<a /i.test(tag)) inAState = true;
        else if (/^<\/a[\s>\/]/i.test(tag)) inAState = false;
        i += tag.length; continue;
      }
      buf += '<'; i++; continue;
    }
    if (ch === '[' || (ch === '!' && src[i + 1] === '[')) {
      const isImg = ch === '!';
      const res = tryLink(src, isImg ? i + 1 : i, isImg, refs);
      if (res) {
        flush();
        const kids = scanInline(src.slice(res.ts, res.te), refs, true);
        if (res.isImage) nodes.push({ t: 'i', src: res.href, title: res.title, alt: altText(kids) });
        else nodes.push({ t: 'a', href: res.href, title: res.title, ch: kids });
        i = res.end; continue;
      }
      if (ch === '!') { buf += '!'; i++; continue; }
      buf += '['; i++; continue;
    }
    if (ch === '*' || ch === '_' || ch === '~') {
      const run = countRun(src, i, ch);
      if (ch === '~' && run > 2) { buf += '~'.repeat(run); i += run; continue; }
      const o = canOpen(src, i, run, ch);
      const c = canClose(src, i, run, ch);
      flush();
      const d = { t: 'd', ch, n: run, orig: run, o, c };
      nodes.push(d); delims.push(d);
      i += run; continue;
    }
    if (ch === '&') {
      const m = entRefAt(src, i);
      if (m > 0) {
        if (src[i + 1] === '#') buf += decodeNumeric(src, i, m);
        else { flush(); nodes.push({ t: 'r', s: src.slice(i, i + m) }); }
        i += m; continue;
      }
      buf += '&'; i++; continue;
    }
    if (ch === '\n') {
      let sp = 0, k = i - 1;
      while (k >= 0 && src[k] === ' ') { sp++; k--; }
      if (sp >= 2) {
        buf = buf.slice(0, buf.length - sp);
        flush(); nodes.push({ t: 'b' }); i++;
        while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
        continue;
      }
      buf += '\n'; i++; continue;
    }
    if (!inAState && !noExt) {
      if (ch === 'w' && src.startsWith('www.', i)) {
        if (i === 0 || !isAlnum(src[i - 1])) {
          const end = matchExtUrl(src, i, true);
          if (end !== -1) {
            const url = src.slice(i, end);
            flush(); nodes.push({ t: 'l', href: 'http://' + url, text: url }); i = end; continue;
          }
        }
      } else if ((ch === 'h' || ch === 'H' || ch === 'f' || ch === 'F') &&
          schemeLenCI(src, i) > 0) {
        const end = matchExtUrl(src, i, false);
        if (end !== -1) {
          const url = src.slice(i, end);
          flush(); nodes.push({ t: 'l', href: url, text: url }); i = end; continue;
        }
      } else if ((ch === 'm' && src.startsWith('mailto:', i)) ||
          (ch === 'x' && src.startsWith('xmpp:', i))) {
        // Scheme autolink: lowercase mailto:/xmpp: + a valid email (xmpp
        // may add one /path segment). Preceding char must not be alnum.
        if (i === 0 || !isAlnum(src[i - 1])) {
          const schemeLen = ch === 'm' ? 7 : 5;
          const emailEnd = matchEmail(src, i + schemeLen);
          if (emailEnd !== -1) {
            let end = emailEnd;
            if (ch === 'x' && src[end] === '/') {
              let k = end + 1;
              while (k < n && src[k] !== '/' && src[k] !== ' ' && src[k] !== '\t' &&
                  src[k] !== '\n' && src[k] !== '<' && src[k] !== '"' && src[k] !== "'") k++;
              while (k > end + 1 && /[?!.,:;*_~'"]/.test(src[k - 1])) k--;
              if (k > end + 1) end = k;
            }
            const url = src.slice(i, end);
            flush(); nodes.push({ t: 'l', href: url, text: url }); i = end; continue;
          }
        }
      } else if (isLocalChar(ch) && (i === 0 || !isLocalChar(src[i - 1]))) {
        const end = matchEmail(src, i);
        if (end !== -1) {
          const em = src.slice(i, end);
          flush(); nodes.push({ t: 'l', href: 'mailto:' + em, text: em }); i = end; continue;
        }
      }
    }
    buf += ch; i++;
  }
  flush();
  processEmphasis(nodes, delims);
  return nodes;
}

// ---------------------------------------------------------------------------
// Block parser. Lines are {s, nl}: s is the line text without its newline,
// nl is true when the line was terminated by '\n'. A line is blank iff it
// is whitespace-only AND (terminated OR empty).
function isBlankLine(ln) {
  if (ln.s.length === 0) return true;
  if (!ln.nl) return false;
  for (let i = 0; i < ln.s.length; i++) {
    const c = ln.s[i];
    if (c !== ' ' && c !== '\t') return false;
  }
  return true;
}
function splitLines(md) {
  const parts = md.split('\n');
  // A trailing "" part is only the artifact of a final \n, not a real line.
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  const lines = [];
  for (let k = 0; k < parts.length; k++) {
    const isLast = k === parts.length - 1;
    lines.push({ s: parts[k], nl: !isLast || md.endsWith('\n') });
  }
  return lines;
}
// HTML block start types (CommonMark 0.31.2). Returns the type (1-7) or 0.
// `s` is the line content after up to 3 spaces of indent.
const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul').split(' '));
function htmlBlockType(s) {
  if (s[0] !== '<') return 0;
  // Type 1: script, pre, style, textarea (start tag only).
  let m = /^<(script|pre|style|textarea)([ \t\n\r\/>]|$)/i.exec(s);
  if (m) return 1;
  // Type 2: comment.
  if (s.startsWith('<!--')) {
    const nxt = s[4];
    if (nxt !== '>' && nxt !== '-') return 2;
    return 0;
  }
  // Type 3: processing instruction.
  if (s.startsWith('<?')) return 3;
  // Type 4: declaration <! + letter.
  if (s.startsWith('<!') && /[A-Za-z]/.test(s[2] || '')) return 4;
  // Type 5: CDATA.
  if (s.startsWith('<![CDATA[')) return 5;
  // Type 6: open or close tag of a block tag.
  m = /^<\/?([A-Za-z][A-Za-z0-9-]*)([ \t\n\r\/>]|$)/.exec(s);
  if (m && BLOCK_TAGS.has(m[1].toLowerCase())) return 6;
  // Type 7: any other complete open or close tag, followed by whitespace
  // or end of line (and only whitespace after it on the line).
  const tag = matchRawHtml(s, 0);
  if (tag !== null) {
    const rest = s.slice(tag.length);
    if (/^[ \t]*$/.test(rest)) return 7;
  }
  return 0;
}
function htmlBlockEndType(t) {
  // Returns the end condition: 'tag' (matching end tag), 'blank', or a string
  // to search for.
  if (t === 1) return 'tag';
  if (t === 2) return '-->';
  if (t === 3) return '?>';
  if (t === 4 || t === 5) return '>';
  return 'blank';
}

// ATX heading: returns the level (1-6) or 0.
function atxLevel(s) {
  let i = 0;
  while (i < s.length && s[i] === '#') i++;
  if (i === 0 || i > 6) return 0;
  if (i >= s.length) return i;
  const c = s[i];
  if (c === ' ' || c === '\t') return i;
  return 0;
}
// Thematic break: 3+ of the same -, _, * with optional spaces between.
function isHr(s) {
  let ch = null, count = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ' ' || c === '\t') continue;
    if (c === '-' || c === '_' || c === '*') {
      if (ch === null) ch = c;
      if (c !== ch) return false;
      count++;
    } else return false;
  }
  return count >= 3;
}
// Setext underline: === or --- (1+ chars, optional trailing spaces).
function setextLevel(s) {
  let i = 0;
  while (i < s.length && s[i] === '=') i++;
  if (i > 0) {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
    if (i === s.length) return 1;
    return 0;
  }
  i = 0;
  while (i < s.length && s[i] === '-') i++;
  if (i > 0) {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
    if (i === s.length) return 2;
  }
  return 0;
}
// Fence start: returns {ch, len, info} or null. Backtick info must not
// contain a backtick.
function fenceStart(s) {
  if (s.length === 0) return null;
  const ch = s[0];
  if (ch !== '`' && ch !== '~') return null;
  let i = 0;
  while (i < s.length && s[i] === ch) i++;
  if (i < 3) return null;
  const info = s.slice(i).trim();
  if (ch === '`' && info.indexOf('`') !== -1) return null;
  return { ch, len: i, info };
}
// List marker at the start of s (after up to 3 spaces). Returns
// {ordered, start, markerLen, bullet} or null.
function listMarker(s) {
  if (s.length === 0) return null;
  const c = s[0];
  if (c === '-' || c === '+' || c === '*') {
    if (s.length === 1) return { ordered: false, markerLen: 1, bullet: c };
    const d = s[1];
    if (d === ' ' || d === '\t') return { ordered: false, markerLen: 1, bullet: c };
    return null;
  }
  if (c >= '0' && c <= '9') {
    let i = 0;
    while (i < s.length && s[i] >= '0' && s[i] <= '9') i++;
    if (i === 0 || i > 9) return null;
    if (i >= s.length) return null;
    const d = s[i];
    if (d !== '.' && d !== ')') return null;
    if (i + 1 >= s.length) return { ordered: true, start: parseInt(s.slice(0, i), 10), markerLen: i + 1, delim: d };
    const e = s[i + 1];
    if (e === ' ' || e === '\t') return { ordered: true, start: parseInt(s.slice(0, i), 10), markerLen: i + 1, delim: d };
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Try to parse a link reference definition starting at lines[i]. Returns the
// number of lines consumed, or 0 if it is not a definition. Adds the ref to
// `refs` on success. A definition may span up to 3 lines (label, dest,
// title), each on its own line.
function tryRefDef(lines, i, refs) {
  const n = lines.length;
  let ln = lines[i];
  if (isBlankLine(ln)) return 0;
  let s = sliceCol(ln.s, Math.min(indentCols(ln.s), 3));
  if (s[0] !== '[') return 0;
  const lab = scanLabelLines(lines, i, s);
  if (lab === null) return 0;
  const key = foldLabel(lab.text);
  if (key.length === 0) return 0;
  let rest = lab.rest;
  // The ':' must follow the label (optional whitespace allowed before it? no
  // - the spec requires ':' immediately after ']'... allow whitespace?).
  let p = 0;
  while (p < rest.length && (rest[p] === ' ' || rest[p] === '\t')) p++;
  if (rest[p] !== ':') return 0;
  p++;
  let li = lab.endLi; // current line index
  let cur = rest.slice(p); // remainder of the current line
  // Skip whitespace; if the line ends, the dest is on the next line.
  function skipWS() {
    while (true) {
      let q = 0;
      while (q < cur.length && (cur[q] === ' ' || cur[q] === '\t')) q++;
      cur = cur.slice(q);
      if (cur.length > 0) return true;
      li++;
      if (li >= n || isBlankLine(lines[li])) return false;
      cur = sliceCol(lines[li].s, Math.min(indentCols(lines[li].s), 3));
    }
  }
  if (!skipWS()) return 0;
  // Parse the destination (angle or bare) from `cur`.
  let dest = null;
  if (cur[0] === '<') {
    let k = 1, ok = false;
    while (k < cur.length) {
      if (cur[k] === '\\' && k + 1 < cur.length && isPunct(cur[k + 1])) { k += 2; continue; }
      if (cur[k] === '<' || cur[k] === '\n') break;
      if (cur[k] === '>') { ok = true; break; }
      k++;
    }
    if (!ok) return 0;
    dest = resolveEscapes(cur.slice(1, k));
    cur = cur.slice(k + 1);
  } else {
    let k = 0, depth = 0, ok = true;
    while (k < cur.length) {
      const c = cur[k];
      if (c === ' ' || c === '\t' || c === '\n') break;
      if (c === '\\' && k + 1 < cur.length && isPunct(cur[k + 1])) { k += 2; continue; }
      if (c === '(') { depth++; k++; continue; }
      if (c === ')') {
        if (depth === 0) { ok = false; break; }
        depth--; k++; continue;
      }
      if (c < ' ') { ok = false; break; }
      k++;
    }
    if (!ok || k === 0) return 0;
    dest = resolveEscapes(cur.slice(0, k));
    cur = cur.slice(k);
  }
  // A title must be separated from the destination by whitespace; content
  // glued directly onto the destination invalidates the definition.
  if (cur.length > 0 && cur[0] !== ' ' && cur[0] !== '\t') return 0;
  // Optional title.
  let title = null;
  // Skip whitespace on this line; if the line ends, the title may be on the
  // next line (but the definition may also end here).
  let q = 0;
  while (q < cur.length && (cur[q] === ' ' || cur[q] === '\t')) q++;
  cur = cur.slice(q);
  if (cur.length === 0) {
    // End of line: try the next line for a title; if none, the def ends.
    const saveLi = li, saveCur = cur;
    li++;
    if (li < n && !isBlankLine(lines[li])) {
      const nc = lines[li].s.replace(/^[ \t]+/, '');
      const t = scanTitleLines(lines, li, nc);
      if (t !== null) {
        // After the title, the rest of the line must be blank.
        if (/^[ \t]*$/.test(t.rest)) {
          title = t.title;
          li = t.endLi;
          cur = '';
        } else {
          // Not a valid title line: the def ends without a title, and this
          // line is NOT consumed.
          li = saveLi; cur = saveCur;
        }
      } else {
        li = saveLi; cur = saveCur;
      }
    } else {
      li = saveLi; cur = saveCur;
    }
  } else {
    const t = scanTitleLines(lines, li, cur);
    if (t !== null) {
      if (/^[ \t]*$/.test(t.rest)) {
        title = t.title;
        li = t.endLi;
        cur = '';
      } else return 0;
    } else return 0;
  }
  // After the dest/title, the rest of the current line must be blank.
  if (!/^[ \t]*$/.test(cur)) return 0;
  if (!refs.has(key)) refs.set(key, { href: dest, title });
  return li - i + 1;
}
// Scan a title starting at `cur` (remainder of line `li`, starting with the
// opening quote). The title may span lines; newlines are kept in the title.
// Returns {title, endLi, rest} or null.
function scanTitleLines(lines, li, cur) {
  const n = lines.length;
  const q = cur[0];
  if (q !== '"' && q !== "'" && q !== '(') return null;
  let content = '';
  let depth = q === '(' ? 1 : 0;
  let k = 1;
  let curLi = li;
  let curStr = cur;
  while (true) {
    while (k < curStr.length) {
      const c = curStr[k];
      if (c === '\\' && k + 1 < curStr.length && isPunct(curStr[k + 1])) {
        content += curStr[k] + curStr[k + 1];
        k += 2;
        continue;
      }
      if (q === '(') {
        if (c === '(') { depth++; content += c; k++; continue; }
        if (c === ')') {
          depth--;
          if (depth === 0) return { title: resolveEscapes(content), endLi: curLi, rest: curStr.slice(k + 1) };
          content += c; k++; continue;
        }
      } else if (c === q) {
        return { title: resolveEscapes(content), endLi: curLi, rest: curStr.slice(k + 1) };
      }
      content += c;
      k++;
    }
    curLi++;
    if (curLi >= n || isBlankLine(lines[curLi])) return null;
    content += '\n';
    curStr = sliceCol(lines[curLi].s, Math.min(indentCols(lines[curLi].s), 3));
    k = 0;
  }
}

// Scan a link label starting at lines[i] position 1 (just after '['). The
// label may span lines; newlines are kept in the text (folded later).
// Returns {text, endLi, rest} or null.
function scanLabelLines(lines, i, s) {
  const n = lines.length;
  let text = '';
  let li = i;
  let cur = s;
  let k = 1;
  while (true) {
    while (k < cur.length) {
      const c = cur[k];
      if (c === '\\' && k + 1 < cur.length && isPunct(cur[k + 1])) { text += cur[k] + cur[k + 1]; k += 2; continue; }
      if (c === '[') return null;
      if (c === ']') return { text, endLi: li, rest: cur.slice(k + 1) };
      text += c;
      k++;
    }
    li++;
    if (li >= n || isBlankLine(lines[li])) return null;
    text += '\n';
    cur = sliceCol(lines[li].s, Math.min(indentCols(lines[li].s), 3));
    k = 0;
    if (li - i >= 3) return null;
  }
}

// Parse a title ("...", '...', or (...)) at the start of s. Returns
// {title, rest} or null. The title is on one line.
function parseTitle(s) {
  if (s.length === 0) return null;
  const q = s[0];
  if (q === '"' || q === "'") {
    let k = 1;
    while (k < s.length) {
      if (s[k] === '\\' && k + 1 < s.length && isPunct(s[k + 1])) { k += 2; continue; }
      if (s[k] === q) return { title: resolveEscapes(s.slice(1, k)), rest: s.slice(k + 1) };
      k++;
    }
    return null;
  }
  if (q === '(') {
    let k = 1, depth = 1;
    while (k < s.length) {
      if (s[k] === '\\' && k + 1 < s.length && isPunct(s[k + 1])) { k += 2; continue; }
      if (s[k] === '(') { depth++; k++; continue; }
      if (s[k] === ')') {
        depth--;
        if (depth === 0) return { title: resolveEscapes(s.slice(1, k)), rest: s.slice(k + 1) };
        k++; continue;
      }
      k++;
    }
    return null;
  }
  return null;
}

// Does the line at lines[j] start a block that interrupts a paragraph?
// `firstLine` is the paragraph's first line content (for the table check).
function interruptsPara(lines, j, ctx) {
  const ln = lines[j];
  if (isBlankLine(ln)) return true;
  // A whitespace-only line that is not blank (unterminated, e.g. trailing
  // spaces at the end of a container's inner source) is paragraph content,
  // not an interrupting blank.
  if (/^[ \t]+$/.test(ln.s)) return false;
  const ind = indentCols(ln.s);
  // A line indented 4+ columns is indented code, which cannot interrupt.
  if (ind >= 4) return false;
  const s = sliceCol(ln.s, Math.min(ind, 3));
  if (s.length === 0) return true;
  if (atxLevel(s) > 0) return true;
  if (fenceStart(s) !== null) return true;
  if (isHr(s)) return true;
  if (htmlBlockType(s) >= 1 && htmlBlockType(s) <= 6) return true;
  if (s[0] === '>') return true;
  const lm = listMarker(s);
  if (lm !== null) {
    // An empty list item cannot interrupt a paragraph.
    const after = s.slice(lm.markerLen);
    if (/^[ \t]*$/.test(after)) return false;
    if (!lm.ordered) return true;
    // An ordered list interrupts a paragraph only when it starts with 1,
    // EXCEPT inside a list item, where any start number interrupts.
    if (lm.start === 1 || ctx === 'list') return true;
    return false;
  }
  return false;
}

// Collect a paragraph starting at lines[i]. Returns {node, next} where node
// is a para/head node (or null if only ref defs were consumed) and next is
// the index after the paragraph.
function parseParagraph(lines, i, refs, ctx) {
  const n = lines.length;
  let j = i;
  const plines = [];
  while (j < n) {
    if (isBlankLine(lines[j])) break;
    // A setext underline ends the paragraph (it becomes a heading). This
    // must be checked before the hr interrupt, since --- is both. A lazy
    // setext line (4 spaces prepended by the quote parser) is paragraph
    // text, never an underline.
    const ind = indentCols(lines[j].s);
    const s = sliceCol(lines[j].s, Math.min(ind, 3));
    if (j > i && !lines[j].lazySetext && setextLevel(s) > 0) {
      plines.push(lines[j]);
      j++;
      break;
    }
    if (j > i && interruptsPara(lines, j, ctx)) break;
    // Inside a container, a paragraph continuation line indented by 4+
    // columns loses 4 of them (the indented-code indent is stripped even
    // though the line stays part of the paragraph). At the top level the
    // indentation is preserved. A lazy-setext line keeps its prepended
    // spaces (they are content, not indentation).
    if (j > i && ctx !== 'top' && ind >= 4 && !lines[j].lazySetext) {
      plines.push({ s: sliceCol(lines[j].s, 4), nl: lines[j].nl });
    } else {
      plines.push(lines[j]);
    }
    j++;
  }
  if (plines.length === 0) return { node: null, next: j };
  // Setext: the last line is an underline (unless it is a lazy-setext line).
  const last = plines[plines.length - 1];
  const lastInd = indentCols(last.s);
  const lastS = sliceCol(last.s, Math.min(lastInd, 3));
  const sl = last.lazySetext ? 0 : setextLevel(lastS);
  if (sl > 0 && plines.length > 1) {
    const text = plines.slice(0, -1).map(l => l.s).join('\n')
      .replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
    return { node: { t: 'head', level: sl, text }, next: j };
  }
  if (sl > 0 && plines.length === 1) {
    // A lone setext line is not a heading (it is paragraph text).
  }
  const text = plines.map(l => l.s).join('\n');
  return { node: { t: 'para', text }, next: j };
}

// ---------------------------------------------------------------------------
// Is the last top-level block of `nodes` a paragraph (recursing into quotes
// and list items)? Used for lazy-line inclusion.
function lastBlockIsPara(nodes) {
  if (nodes.length === 0) return false;
  const last = nodes[nodes.length - 1];
  if (last.t === 'para') return true;
  if (last.t === 'quote') return lastBlockIsPara(last.ch);
  if (last.t === 'list') {
    const items = last.items;
    if (items.length === 0) return false;
    return lastBlockIsPara(items[items.length - 1].ch);
  }
  return false;
}
// Is the last top-level block of `nodes` a paragraph that is a direct child
// (not inside a list or quote)? Used for the lazy-setext prepend.
function lastBlockIsDirectPara(nodes) {
  if (nodes.length === 0) return false;
  return nodes[nodes.length - 1].t === 'para';
}

// Expand the leading whitespace of s (which starts at column startCol) to
// spaces, returning the expanded string (content after the whitespace kept).
function expandLeadingFrom(s, startCol) {
  let c = startCol;
  let i = 0;
  let out = '';
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) {
    if (s[i] === ' ') { out += ' '; c++; i++; }
    else {
      const next = c + (4 - (c % 4));
      out += ' '.repeat(next - c);
      c = next; i++;
    }
  }
  return out + s.slice(i);
}
// Strip a blockquote marker from line s. Returns the inner line, or null
// when there is no '>' marker. A tab after '>' is only partly consumed:
// one column is the separator, the rest becomes spaces (remeasured from
// the '>' column).
function stripQuote(s) {
  const ind = indentCols(s);
  let i = 0;
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  if (s[i] !== '>') return null;
  const gtCol = ind;
  const rest = s.slice(i + 1);
  const restCol = gtCol + 1;
  if (rest[0] === ' ') return expandLeadingFrom(rest.slice(1), restCol + 1);
  if (rest[0] === '\t') {
    const w = 4 - (restCol % 4);
    return ' '.repeat(w - 1) + expandLeadingFrom(rest.slice(1), restCol + w);
  }
  return rest;
}

// Collect a blockquote starting at lines[i]. Returns {node, next}.
function parseQuote(lines, i, refs) {
  const n = lines.length;
  const inner = []; // {s, nl, lazy}
  let j = i;
  let first = true;
  while (j < n) {
    const ln = lines[j];
    const stripped = stripQuote(ln.s);
    if (stripped !== null) {
      inner.push({ s: stripped, nl: ln.nl, lazy: false });
      j++;
      first = false;
      continue;
    }
    // No '>' marker: blank line ends the quote; a lazy line may continue it.
    if (isBlankLine(ln)) break;
    if (first) break; // should not happen (we start on a '>' line)
    // Lazy line: include only if the innermost open block is a paragraph
    // and the line is not a block-start line.
    const lInd = indentCols(ln.s);
    const s = sliceCol(ln.s, Math.min(lInd, 3));
    if (atxLevel(s) > 0) break;
    if (fenceStart(s) !== null) break;
    if (isHr(s)) break;
    if (htmlBlockType(s) >= 1 && htmlBlockType(s) <= 6) break;
    if (listMarker(s) !== null) break;
    const innerLines = inner.map(l => ({ s: l.s, nl: l.nl, lazySetext: l.lazySetext }));
    if (innerLines.length > 0) innerLines[innerLines.length - 1].nl = false;
    const parsed = parseBlocks(innerLines, refs, 'quote');
    if (!lastBlockIsPara(parsed)) break;
    // A trailing blank line in the inner source closes the paragraph: a
    // lazy line after it does not continue the quote.
    const lastInner = inner[inner.length - 1];
    if (lastInner && isBlankLine({ s: lastInner.s, nl: lastInner.nl })) break;
    // Lazy setext line: if the previous inner line was also lazy and the
    // paragraph is a direct child of this quote, prepend 4 spaces.
    let text = ln.s;
    let lazySetext = false;
    const isSetextShape = /^=+[ \t]*$/.test(s) || /^--[ \t]*$/.test(s);
    if (isSetextShape && inner.length > 0 && inner[inner.length - 1].lazy &&
        lastBlockIsDirectPara(parsed)) {
      text = '    ' + s;
      lazySetext = true;
    }
    inner.push({ s: text, nl: ln.nl, lazy: true, lazySetext });
    j++;
  }
  const innerLines = inner.map(l => ({ s: l.s, nl: l.nl, lazySetext: l.lazySetext }));
  if (innerLines.length > 0) innerLines[innerLines.length - 1].nl = false;
  const ch = parseBlocks(innerLines, refs, 'quote');
  return { node: { t: 'quote', ch }, next: j };
}

// Content indent of a list item: the column where the item's content starts.
// `line` is the line content after up to 3 spaces; `markerLen` is the
// marker's length in characters. Returns {col, idx, contentCol, contentIdx}:
// col is the content indent (capped at markerLen+1 when the content lies
// more than 4 columns past the marker), idx is where the first line's
// content starts in `line`, and contentCol/contentIdx are the true column
// and index of the first content character (so the first line can be
// rebuilt as (contentCol-col) spaces + content).
function listContentIndent(line, markerLen) {
  let col = markerLen;
  let k = markerLen;
  while (k < line.length && (line[k] === ' ' || line[k] === '\t')) {
    if (line[k] === ' ') { col++; k++; }
    else { col += 4 - (col % 4); k++; }
  }
  const contentCol = col;
  const contentIdx = k;
  if (k >= line.length) {
    // Empty item: the content indent is markerLen+1 (the marker plus one
    // space); the next line's content is stripped by that amount.
    return { col: markerLen + 1, idx: markerLen + 1, contentCol, contentIdx };
  }
  if (contentCol - markerLen > 4) return { col: markerLen + 1, idx: contentIdx, contentCol, contentIdx };
  return { col: contentCol, idx: contentIdx, contentCol, contentIdx };
}

// Collect a list starting at lines[i]. Returns {node, next}.
// Scan collected lines for an unclosed fenced code block. Returns
// {ch, len} if a fence is open, else null. Used while collecting list-item
// lines: fence content ignores container indentation, so a line with indent
// below the item's content indent is still fence content, not an item end.
function openFence(lines) {
  let fence = null;
  for (const l of lines) {
    if (l.blank) continue;
    const ind = indentCols(l.s);
    const s = sliceCol(l.s, Math.min(ind, 3));
    if (fence === null) {
      const fs = fenceStart(s);
      if (fs !== null) fence = { ch: fs.ch, len: fs.len };
    } else if (s.length >= fence.len && s[0] === fence.ch) {
      let k = 0;
      while (k < s.length && s[k] === fence.ch) k++;
      if (k >= fence.len && /^[ \t]*$/.test(s.slice(k))) fence = null;
    }
  }
  return fence;
}

function parseList(lines, i, refs) {
  const n = lines.length;
  const firstInd = indentCols(lines[i].s);
  const firstS = sliceCol(lines[i].s, Math.min(firstInd, 3));
  const firstM = listMarker(firstS);
  const ordered = firstM.ordered;
  const start = ordered ? firstM.start : 0;
  const items = [];
  let j = i;
  let loose = false;
  let blankBeforeItem = false; // a blank line separated the previous item from the next
  while (j < n) {
    const ln = lines[j];
    if (isBlankLine(ln)) break;
    const ind = indentCols(ln.s);
    const s = sliceCol(ln.s, Math.min(ind, 3));
    if (isHr(s)) break; // an hr line at the list level ends the list
    const m = listMarker(s);
    if (m === null) break;
    if (m.ordered !== ordered) break;
    if (ordered && m.delim !== firstM.delim) break;
    if (!ordered && m.bullet !== firstM.bullet) break;
    if (ind > firstInd + 3) break;
    const strip = Math.min(ind, 3);
    const ci = listContentIndent(s, m.markerLen);
    const contentInd = strip + ci.col;
    const itemLines = [];
    const firstLead = Math.max(0, ci.contentCol - ci.col);
    const firstContent = s.slice(ci.idx);
    // An item whose marker line has no content (only whitespace after the
    // marker) starts empty; trailing spaces are not content.
    itemLines.push({ s: /^[ \t]*$/.test(firstContent) ? '' : ' '.repeat(firstLead) + firstContent, nl: ln.nl, blank: false });
    j++;
    let itemBlank = false;
    while (j < n) {
      const l2 = lines[j];
      if (isBlankLine(l2)) {
        let k = j + 1;
        while (k < n && isBlankLine(lines[k])) k++;
        if (k >= n) { itemBlank = true; j = k; break; }
        const kInd = indentCols(lines[k].s);
        const kS = sliceCol(lines[k].s, Math.min(kInd, 3));
        const kM = listMarker(kS);
        const kSameMarker = kM !== null && kM.ordered === ordered &&
          (ordered ? kM.delim === firstM.delim : kM.bullet === firstM.bullet) && kInd <= firstInd + 3;
        // An item with no content yet (empty marker) ends at a blank line;
        // following indented lines are not part of it. But a following item
        // marker of the same list continues the list (it is the next item).
        const itemEmpty = itemLines.every(l => l.blank || /^[ \t]*$/.test(l.s));
        if (itemEmpty) {
          if (kSameMarker) {
            blankBeforeItem = true;
            itemBlank = true;
            j = k;
            break;
          }
          itemBlank = true; break;
        }
        if (kInd >= contentInd) {
          for (let b = j; b < k; b++) itemLines.push({ s: '', nl: lines[b].nl, blank: true });
          j = k;
          continue;
        }
        if (kSameMarker) {
          blankBeforeItem = true;
          itemBlank = true;
          j = k;
          break;
        }
        // The next line is outside this item: end the item WITHOUT
        // skipping the blank line, so the enclosing parser sees the blank
        // (it separates this item's last block from what follows, which
        // can loosen the enclosing list).
        itemBlank = true;
        break;
      }
      const l2Ind = indentCols(l2.s);
      const l2S = sliceCol(l2.s, Math.min(l2Ind, 3));
      const l2M = listMarker(l2S);
      if (l2Ind < contentInd && isHr(l2S)) break;
      if (l2M !== null && l2M.ordered === ordered &&
          (ordered ? l2M.delim === firstM.delim : l2M.bullet === firstM.bullet) &&
          l2Ind < contentInd && l2Ind <= firstInd + 3) break;
      if (l2Ind >= contentInd) {
        itemLines.push({ s: sliceCol(l2.s, contentInd), nl: l2.nl, blank: false });
        j++;
        continue;
      }
      // Fence content ignores container indentation: while a fenced code
      // block in this item is unclosed, every line is fence content.
      if (openFence(itemLines) !== null) {
        itemLines.push({ s: l2.s, nl: l2.nl, blank: false });
        j++;
        continue;
      }
      const innerLines = itemLines.filter(l => !l.blank).map(l => ({ s: l.s, nl: l.nl }));
      if (innerLines.length > 0) innerLines[innerLines.length - 1].nl = false;
      const parsed = parseBlocks(innerLines, refs, 'list');
      if (lastBlockIsPara(parsed) && !isHr(l2S) && atxLevel(l2S) === 0 &&
          fenceStart(l2S) === null && htmlBlockType(l2S) < 1 && l2M === null) {
        itemLines.push({ s: l2.s, nl: l2.nl, blank: false });
        j++;
        continue;
      }
      break;
    }
    while (itemLines.length > 0 && itemLines[itemLines.length - 1].blank) itemLines.pop();
    if (blankBeforeItem) loose = true;
    blankBeforeItem = false;
    const innerLines = itemLines.map(l => ({ s: l.s, nl: l.nl }));
    if (innerLines.length > 0) innerLines[innerLines.length - 1].nl = false;
    const ch = parseBlocks(innerLines, refs, 'list');
    // Two-tier blank rule: the list is loose if this item's own inner
    // blocks were separated by a blank line. A blank inside a nested list
    // or quote does not count (it only loosens that nested list).
    if (ch.loose) loose = true;
    items.push({ ch });
    if (itemBlank && j >= n) break;
  }
  if (items.length === 0) return { node: null, next: i };
  for (const it of items) {
    if (it.ch.length > 0 && it.ch[0].t === 'para') {
      const m = /^\[( |x|X)\] /.exec(it.ch[0].text);
      if (m) {
        it.task = m[1] === ' ' ? 'unchecked' : 'checked';
        it.ch[0] = { t: 'para', text: it.ch[0].text.slice(4) };
        if (it.ch[0].text.length === 0) it.ch.shift();
      } else it.task = null;
    } else it.task = null;
  }
  return { node: { t: 'list', ordered, start, tight: !loose, items }, next: j };
}

// ---------------------------------------------------------------------------
// Table helpers.
function splitTableRow(s) {
  const cells = [];
  let cur = '';
  let i = 0;
  const n = s.length;
  if (s[0] === '|') i = 1;
  while (i < n) {
    const c = s[i];
    if (c === '\\' && i + 1 < n && s[i + 1] === '|') { cur += '|'; i += 2; continue; }
    if (c === '`') {
      const run = countRun(s, i, '`');
      const end = findCodeEnd(s, i + run, run);
      if (end >= 0) { cur += s.slice(i, end + run).replace(/\\\|/g, '|'); i = end + run; continue; }
      cur += '`'; i++; continue;
    }
    if (c === '|') { cells.push(cur); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (n > 0 && s[n - 1] === '|') { /* trailing | creates no extra cell */ }
  else cells.push(cur);
  return cells;
}
function parseDelimRow(s) {
  const cells = splitTableRow(s);
  if (cells.length === 0) return null;
  const align = [];
  for (const cell of cells) {
    const t = cell.trim();
    if (!/^:?-+:?$/.test(t)) return null;
    if (t[0] === ':' && t[t.length - 1] === ':') align.push('center');
    else if (t[t.length - 1] === ':') align.push('right');
    else if (t[0] === ':') align.push('left');
    else align.push(null);
  }
  return align;
}

// The main block parser. Returns an array of block nodes. `inner` is true
// when parsing the inner source of a container (blockquote/list item); it
// enables the paragraph-continuation indent strip.
function parseBlocks(lines, refs, ctx) {
  const nodes = [];
  let loose = false; // a blank line separated two top-level blocks here
  let pendingBlank = false;
  let i = 0;
  const n = lines.length;
  while (i < n) {
    if (isBlankLine(lines[i])) { pendingBlank = true; i++; continue; }
    // Link reference definitions (consumed, no node). A ref def does not
    // clear a pending blank: it is invisible, so a blank before it still
    // separates the surrounding blocks. A blank line before a ref def after
    // a real block loosens the enclosing list (the ref def is a block).
    const defUsed = tryRefDef(lines, i, refs);
    if (defUsed > 0) {
      if (pendingBlank && nodes.length > 0) loose = true;
      i += defUsed; continue;
    }
    if (pendingBlank && nodes.length > 0) loose = true;
    pendingBlank = false;
    const ln = lines[i];
    const ind = indentCols(ln.s);
    const content = sliceCol(ln.s, Math.min(ind, 3));
    // Indented code.
    if (ind >= 4) {
      const codeLines = [];
      while (i < n) {
        const l2 = lines[i];
        if (isBlankLine(l2)) {
          let k = i + 1;
          while (k < n && isBlankLine(lines[k])) k++;
          if (k < n && indentCols(lines[k].s) >= 4) {
            for (let b = i; b < k; b++) codeLines.push(stripIndentKeepTabs(lines[b].s, 4));
            i = k;
            continue;
          }
          break;
        }
        if (indentCols(l2.s) >= 4) { codeLines.push(stripIndentKeepTabs(l2.s, 4)); i++; }
        else break;
      }
      while (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') codeLines.pop();
      nodes.push({ t: 'code', lang: null, text: codeLines.length ? codeLines.join('\n') + '\n' : '' });
      continue;
    }
    // Fenced code.
    const fs = fenceStart(content);
    if (fs !== null) {
      const lang = fs.info.length ? resolveEscapes(fs.info.split(/[ \t]/)[0]) : null;
      const codeLines = [];
      i++;
      let closed = false;
      while (i < n) {
        const l2 = lines[i];
        const l2Ind = indentCols(l2.s);
        const l2S = sliceCol(l2.s, Math.min(l2Ind, 3));
        if (l2S.length >= fs.len && l2S[0] === fs.ch) {
          let k = 0;
          while (k < l2S.length && l2S[k] === fs.ch) k++;
          if (k >= fs.len && /^[ \t]*$/.test(l2S.slice(k))) { closed = true; i++; break; }
        }
        codeLines.push(stripIndentKeepTabs(l2.s, Math.min(ind, 3)));
        i++;
      }
      if (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') codeLines.pop();
      nodes.push({ t: 'code', lang, text: codeLines.length ? codeLines.join('\n') + '\n' : '' });
      continue;
    }
    // ATX heading.
    const al = atxLevel(content);
    if (al > 0) {
      let rest = content.slice(al);
      rest = rest.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
      rest = rest.replace(/[ \t]+#+$/, '').replace(/[ \t]+$/, '');
      if (/^#+$/.test(rest)) rest = '';
      nodes.push({ t: 'head', level: al, text: rest });
      i++;
      continue;
    }
    // Thematic break.
    if (isHr(content)) { nodes.push({ t: 'hr' }); i++; continue; }
    // HTML block.
    const ht = htmlBlockType(content);
    if (ht > 0) {
      const htmlLines = [];
      const endKind = ht === 1 ? 'tag' : ht === 2 ? '-->' : ht === 3 ? '?>' : (ht === 4 || ht === 5) ? '>' : 'blank';
      let tagName = null;
      if (ht === 1) {
        const m = /^<(script|pre|style|textarea)/i.exec(content);
        tagName = m ? m[1].toLowerCase() : null;
      }
      let endedAtBlank = false;
      let endedAtEof = false;
      while (i < n) {
        const l2 = lines[i];
        htmlLines.push(l2.s);
        i++;
        if (endKind === 'blank') {
          if (i < n && isBlankLine(lines[i])) { endedAtBlank = true; break; }
          if (i >= n) endedAtEof = true;
          continue;
        }
        if (endKind === 'tag') {
          if (tagName && new RegExp('</' + tagName + '[ \t]*>', 'i').test(l2.s)) break;
          if (i >= n) endedAtEof = true;
          continue;
        }
        if (endKind === '-->' || endKind === '?>') {
          if (l2.s.indexOf(endKind) !== -1) break;
          if (i >= n) endedAtEof = true;
          continue;
        }
        // '>' end (types 4 and 5): the first '>' after the start.
        if (l2.s.indexOf('>') !== -1) break;
        if (i >= n) endedAtEof = true;
      }
      let text = htmlLines.join('\n');
      const nextBlank = i < n && isBlankLine(lines[i]);
      if (!nextBlank && htmlLines.length > 0 && lines[i - 1].nl) text += '\n';
      nodes.push({ t: 'html', text });
      continue;
    }
    // Blockquote.
    if (content[0] === '>') {
      const r = parseQuote(lines, i, refs);
      nodes.push(r.node);
      i = r.next;
      continue;
    }
    // List.
    const lm = listMarker(content);
    if (lm !== null) {
      const after = content.slice(lm.markerLen);
      if (!/^[ \t]*$/.test(after)) {
        const r = parseList(lines, i, refs);
        if (r.node !== null) { nodes.push(r.node); i = r.next; continue; }
      }
      // An empty list item at a block start: it is a list (not a paragraph).
      if (/^[ \t]*$/.test(after)) {
        const r = parseList(lines, i, refs);
        if (r.node !== null) { nodes.push(r.node); i = r.next; continue; }
      }
    }
    // Table: header line with '|' and a delimiter row next.
    if (content.indexOf('|') !== -1 && i + 1 < n) {
      const dInd = indentCols(lines[i + 1].s);
      const dS = sliceCol(lines[i + 1].s, Math.min(dInd, 3));
      const align = parseDelimRow(dS);
      if (align !== null) {
        const head = splitTableRow(content).map(c => c.trim());
        if (head.length === align.length) {
          const rows = [];
          i += 2;
          while (i < n) {
            // A whitespace-only line of spaces + a single tab is a table
            // row (empty cells); any other blank line ends the table.
            const isTabRow = /^ *\t$/.test(lines[i].s);
            if (!isTabRow && isBlankLine(lines[i])) break;
            // A row ends the table if the line starts a block that would
            // interrupt a paragraph (blockquote, heading, fence, list, hr,
            // HTML) or is indented code (indent >= 4). Plain text is a row.
            if (!isTabRow && (interruptsPara(lines, i, ctx) || indentCols(lines[i].s) >= 4)) break;
            const rInd = indentCols(lines[i].s);
            const rS = sliceCol(lines[i].s, Math.min(rInd, 3));
            const cells = splitTableRow(rS).map(c => c.trim());
            while (cells.length < head.length) cells.push('');
            rows.push(cells.slice(0, head.length));
            i++;
          }
          nodes.push({ t: 'table', align, head, rows });
          continue;
        }
      }
    }
    // Paragraph (with setext).
    const pr = parseParagraph(lines, i, refs, ctx);
    if (pr.node !== null) nodes.push(pr.node);
    i = pr.next;
  }
  nodes.loose = loose;
  return nodes;
}

// ---------------------------------------------------------------------------
// Rendering.
function renderBlocks(nodes, refs) {
  let out = '';
  for (const nd of nodes) {
    if (nd.t === 'para') {
      out += '<p>' + renderNodes(scanInline(nd.text, refs)) + '</p>\n';
    } else if (nd.t === 'head') {
      out += '<h' + nd.level + '>' + renderNodes(scanInline(nd.text, refs)) + '</h' + nd.level + '>\n';
    } else if (nd.t === 'code') {
      out += '<pre><code' + (nd.lang ? ' class="language-' + escAttr(nd.lang) + '"' : '') + '>' +
        escPlain(nd.text) + '</code></pre>\n';
    } else if (nd.t === 'hr') {
      out += '<hr>\n';
    } else if (nd.t === 'html') {
      out += nd.text;
    } else if (nd.t === 'quote') {
      out += '<blockquote>\n' + renderBlocks(nd.ch, refs) + '</blockquote>\n';
    } else if (nd.t === 'list') {
      const tag = nd.ordered ? 'ol' : 'ul';
      out += '<' + tag + (nd.ordered && nd.start !== 1 ? ' start="' + nd.start + '"' : '') + '>\n';
      for (const it of nd.items) {
        let inner;
        if (nd.tight) {
          // Tight: every paragraph in the item renders without <p> tags.
          inner = '';
          for (const b of it.ch) {
            if (b.t === 'para') {
              let t = renderNodes(scanInline(b.text, refs));
              if (it.task && b === it.ch[0]) {
                const box = '<input ' + (it.task === 'checked' ? 'checked="" ' : '') +
                  'disabled="" type="checkbox">';
                t = box + ' ' + t;
              }
              inner += t;
            } else {
              inner += renderBlocks([b], refs);
            }
          }
        } else {
          inner = renderBlocks(it.ch, refs);
          if (it.task) {
            const box = '<input ' + (it.task === 'checked' ? 'checked="" ' : '') +
              'disabled="" type="checkbox">';
            inner = inner.replace(/^<p>/, '<p>' + box + ' ');
            if (!inner.startsWith('<p>')) inner = '<p>' + box + ' ' + inner + '</p>\n';
          }
        }
        out += '<li>' + inner + '</li>\n';
      }
      out += '</' + tag + '>\n';
    } else if (nd.t === 'table') {
      out += '<table>\n<thead>\n<tr>\n';
      for (let k = 0; k < nd.head.length; k++) {
        const a = nd.align[k];
        out += '<th' + (a ? ' align="' + a + '"' : '') + '>' +
          renderNodes(scanInline(nd.head[k], refs)) + '</th>\n';
      }
      out += '</tr>\n</thead>\n';
      if (nd.rows.length > 0) {
        out += '<tbody>';
        for (const row of nd.rows) {
          out += '<tr>\n';
          for (let k = 0; k < row.length; k++) {
            const a = nd.align[k];
            out += '<td' + (a ? ' align="' + a + '"' : '') + '>' +
              renderNodes(scanInline(row[k], refs)) + '</td>\n';
          }
          out += '</tr>\n';
        }
        out += '</tbody>';
      }
      out += '</table>\n';
    }
  }
  return out;
}

// The entry point: render markdown exactly like marked 18.1.3 (default opts).
// Unclosed-<a> suppression state: once an unclosed <a ...> tag is seen,
// extended autolinks (www/scheme/email) are suppressed for the rest of the
// document until a </a> closes it. This persists across paragraphs/blocks.
let inAState = false;

function parse(md) {
  const refs = new Map();
  inAState = false;
  const lines = splitLines(md.replace(/\r\n?/g, '\n'));
  const nodes = parseBlocks(lines, refs, 'top');
  return renderBlocks(nodes, refs);
}

export { parse };
