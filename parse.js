// MarkSwift — a fast CommonMark 0.31.2 + GFM renderer.
// Written from scratch from the CommonMark spec and the GFM spec.
// parse(markdown) returns HTML byte-identical to marked 18.1.3
// (default options: gfm on, breaks off, pedantic off, async off).
// Dependency-free ES module. Deterministic: no clock, env or I/O.

// ---------------------------------------------------------------------------
// Character classification (CommonMark definitions)
// ---------------------------------------------------------------------------

// Unicode whitespace: Zs category + tab, LF, FF, CR.
function isSpaceCh(ch) {
  if (ch === undefined) return false;
  const c = ch.charCodeAt(0);
  return c === 32 || c === 9 || c === 10 || c === 12 || c === 13 ||
    c === 160 || c === 5760 || (c >= 8192 && c <= 8202) ||
    c === 8239 || c === 8287 || c === 12288;
}

function isSpaceCode(c) {
  return c === 32 || c === 9 || c === 10 || c === 12 || c === 13 ||
    c === 160 || c === 5760 || (c >= 8192 && c <= 8202) ||
    c === 8239 || c === 8287 || c === 12288;
}

// Unicode punctuation: ASCII punctuation or general categories P / S.
const NONASCII_PUNCT = /[\p{P}\p{S}]/u;
function isPunctCh(ch) {
  if (ch === undefined) return false;
  const c = ch.charCodeAt(0);
  if (c < 128) {
    return (c >= 33 && c <= 47) || (c >= 58 && c <= 64) ||
      (c >= 91 && c <= 96) || (c >= 123 && c <= 126);
  }
  return NONASCII_PUNCT.test(ch);
}

function isDigitCode(c) { return c >= 48 && c <= 57; }
function isHexCode(c) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}
function isWordCode(c) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) || c === 95;
}
function isAlphaNumCode(c) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

// ASCII punctuation (for backslash escapes): any of !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~
function isAsciiPunctCode(c) {
  return (c >= 33 && c <= 47) || (c >= 58 && c <= 64) ||
    (c >= 91 && c <= 96) || (c >= 123 && c <= 126);
}

// ---------------------------------------------------------------------------
// HTML escaping.
// Text nodes: numeric character references are decoded first (marked does
// not decode named entities at all; it leaves "&name;" untouched), then
// &, <, >, ", ' are escaped -- except that an "&" introducing something
// that looks like an entity reference (&name; &#123; &#x1f;) is left alone.
// Code spans / hrefs / titles: same escaping but WITHOUT numeric decoding.
// ---------------------------------------------------------------------------

function escAmp(s, i, b, out, decode) {
  // s[i] === '&'. Returns the index just past what was consumed.
  const n1 = i + 1;
  if (n1 < b && s.charCodeAt(n1) === 35) { // '#'
    let j = n1 + 1;
    let hex = false;
    if (j < b && (s.charCodeAt(j) === 120 || s.charCodeAt(j) === 88)) { hex = true; j++; }
    const ds = j;
    if (hex) { while (j < b && isHexCode(s.charCodeAt(j))) j++; }
    else { while (j < b && isDigitCode(s.charCodeAt(j))) j++; }
    const digits = j - ds;
    if (digits >= 1 && digits <= (hex ? 6 : 7) && j < b && s.charCodeAt(j) === 59) {
      if (decode) {
        const cp = parseInt(s.slice(ds, j), hex ? 16 : 10);
        const ch = (cp === 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF))
          ? '\uFFFD' : String.fromCodePoint(cp);
        if (ch === '&') out.push('&amp;');
        else if (ch === '<') out.push('&lt;');
        else if (ch === '>') out.push('&gt;');
        else if (ch === '"') out.push('&quot;');
        else if (ch === "'") out.push('&#39;');
        else out.push(ch);
        return j + 1;
      }
      out.push(s.slice(i, j + 1));
      return j + 1;
    }
    out.push('&amp;');
    return i + 1;
  }
  // named-entity-like: &\w+;
  let j = n1;
  while (j < b && isWordCode(s.charCodeAt(j))) j++;
  if (j > n1 && j < b && s.charCodeAt(j) === 59) {
    out.push(s.slice(i, j + 1));
    return j + 1;
  }
  out.push('&amp;');
  return i + 1;
}

// Escape s[a..b) as inline text (numeric refs decoded). Appends to out[].
function escText(s, a, b, out) {
  let i = a, j = a;
  while (i < b) {
    const cc = s.charCodeAt(i);
    if (cc === 38 || cc === 60 || cc === 62 || cc === 34 || cc === 39) {
      if (j < i) out.push(s.slice(j, i));
      if (cc === 38) i = escAmp(s, i, b, out, true);
      else if (cc === 60) { out.push('&lt;'); i++; }
      else if (cc === 62) { out.push('&gt;'); i++; }
      else if (cc === 34) { out.push('&quot;'); i++; }
      else { out.push('&#39;'); i++; }
      j = i;
    } else i++;
  }
  if (j < b) out.push(s.slice(j, b));
}

// Escape s[a..b) without decoding numeric refs (code spans, hrefs, titles).
function escNoDec(s, a, b, out) {
  let i = a, j = a;
  while (i < b) {
    const cc = s.charCodeAt(i);
    if (cc === 38 || cc === 60 || cc === 62 || cc === 34 || cc === 39) {
      if (j < i) out.push(s.slice(j, i));
      if (cc === 38) i = escAmp(s, i, b, out, false);
      else if (cc === 60) { out.push('&lt;'); i++; }
      else if (cc === 62) { out.push('&gt;'); i++; }
      else if (cc === 34) { out.push('&quot;'); i++; }
      else { out.push('&#39;'); i++; }
      j = i;
    } else i++;
  }
  if (j < b) out.push(s.slice(j, b));
}

// Escape s[a..b) for code spans / code blocks: &, <, >, ", ' are escaped
// unconditionally (no entity passthrough, no numeric decoding).
// (Hrefs, titles and the fenced-code language use escNoDec instead:
// an "&" introducing something entity-like is left alone there.)
function escCode(s, a, b, out) {
  let i = a, j = a;
  while (i < b) {
    const cc = s.charCodeAt(i);
    if (cc === 38 || cc === 60 || cc === 62 || cc === 34 || cc === 39) {
      if (j < i) out.push(s.slice(j, i));
      if (cc === 38) out.push('&amp;');
      else if (cc === 60) out.push('&lt;');
      else if (cc === 62) out.push('&gt;');
      else if (cc === 34) out.push('&quot;');
      else out.push('&#39;');
      i++;
      j = i;
    } else i++;
  }
  if (j < b) out.push(s.slice(j, b));
}

// Escape a whole string (convenience wrapper).
function escTextStr(s) {
  const out = [];
  escText(s, 0, s.length, out);
  return out.join('');
}

// URL cleaning for link/image hrefs: encodeURI, but a bare '%' stays '%'.
function cleanUrl(href) {
  try {
    return encodeURI(href).replace(/%25/g, '%');
  } catch (e) {
    return null;
  }
}

// Link-label normalisation: collapse whitespace, trim, case-fold.
// Unicode case folding (not just toLowerCase): "ß" and "ẞ" fold to
// "ss" (cm-540: "[ẞ]" matches ref "[SS]:"), ligatures expand, "İ"
// folds to "i" + combining dot.
const FOLD_MAP = { 'ß': 'ss', 'ẞ': 'ss', 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st', 'İ': 'i̇' };
function normalizeLabel(s) {
  let t = s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (/[ßẞﬀﬁﬂﬃﬄﬅﬆİ]/.test(t)) {
    t = t.replace(/[ßẞﬀﬁﬂﬃﬄﬅﬆİ]/g, (c) => FOLD_MAP[c]);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------
// Line-based, two-phase parser following the CommonMark algorithm:
// phase 1 builds a block tree (containers: blockquote / list item; leaves:
// paragraph, heading, code, html, thematic break, table), phase 2 extracts
// link reference definitions, resolves list tightness and renders.

// A line cursor tracks position inside one source line, with column-aware
// tab handling. A tab advances to the next multiple of 4 columns; when a
// container only needs part of a tab, the remainder stays as `tab`.
function curOf(line) { return { s: line.s, i: 0, col: 0, tab: 0 }; }
function cPeek(c) { return c.tab > 0 ? ' ' : c.s[c.i]; }
function cEol(c) { return c.tab === 0 && c.i >= c.s.length; }
// Advance one character (a tab counts as its full width).
function cAdv(c) {
  if (c.tab > 0) { c.tab--; c.col++; if (c.tab === 0) c.i++; return; }
  const ch = c.s[c.i];
  if (ch === undefined) return;
  c.i++;
  c.col += (ch === '\t') ? 4 - (c.col % 4) : 1;
}
// Advance exactly one column (one space unit); a tab is partly consumed.
function cAdv1(c) {
  if (c.tab > 0) { c.tab--; c.col++; if (c.tab === 0) c.i++; return; }
  const ch = c.s[c.i];
  if (ch === ' ') { c.i++; c.col++; }
  else if (ch === '\t') {
    const w = 4 - (c.col % 4);
    c.col++;
    if (w === 1) c.i++; else c.tab = w - 1;
  }
}
// Spaces available at the cursor, in columns (all consecutive spaces/tabs).
function cSpaces(c) {
  let n = 0, k = c.i, tab = c.tab, col = c.col;
  for (;;) {
    if (tab > 0) { n += tab; col += tab; k++; tab = 0; }
    else {
      const ch = c.s[k];
      if (ch === ' ') { n++; k++; col++; }
      else if (ch === '\t') { const w = 4 - (col % 4); n += w; col += w; k++; }
      else break;
    }
  }
  return n;
}
// Consume up to n space-columns; returns columns consumed.
// Expand tabs in s to spaces, starting at column col (a tab advances to
// the next multiple of 4). Used for fenced-code content, where a literal
// tab in the source becomes spaces in the output (doc-01/06/13/14/23).
function expandTabs(s, col) {
  if (s.indexOf('\t') === -1) return s;
  let out = '';
  let c = col;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\t') {
      const n = 4 - (c % 4);
      out += ' '.repeat(n);
      c += n;
    } else {
      out += ch;
      c++;
    }
  }
  return out;
}

function cSkip(c, n) {
  let done = 0;
  while (done < n) {
    if (c.tab > 0) {
      const take = Math.min(n - done, c.tab);
      c.tab -= take; c.col += take; done += take;
      if (c.tab === 0) c.i++;
    } else {
      const ch = c.s[c.i];
      if (ch === ' ') { c.i++; c.col++; done++; }
      else if (ch === '\t') {
        const w = 4 - (c.col % 4);
        const take = Math.min(n - done, w);
        c.col += take; done += take;
        if (take === w) c.i++; else c.tab = w - take;
      } else break;
    }
  }
  return done;
}
// Number of space units after the cursor (a tab counts as one unit),
// capped at 5. Does not mutate the cursor.
function cUnits(c) {
  let n = 0, k = c.i, tab = c.tab, col = c.col;
  while (n < 5) {
    if (tab > 0) { n++; tab--; col++; if (tab === 0) k++; }
    else {
      const ch = c.s[k];
      if (ch === ' ') { n++; k++; col++; }
      else if (ch === '\t') {
        const w = 4 - (col % 4);
        n++; col++;
        if (w === 1) k++; else tab = w - 1;
      } else break;
    }
  }
  return n;
}
function cIsBlank(c) {
  let k = c.tab > 0 ? c.i + 1 : c.i;
  const s = c.s;
  while (k < s.length) {
    const ch = s[k];
    if (ch !== ' ' && ch !== '\t') return false;
    k++;
  }
  return true;
}
function cRest(c) {
  if (c.tab > 0) return ' '.repeat(c.tab) + c.s.slice(c.i + 1);
  return c.s.slice(c.i);
}

// Split source into lines (each line without its terminator; eol = had \n).
function splitLines(src) {
  const raw = src.split('\n');
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const eol = i < raw.length - 1;
    if (!eol && raw[i] === '' && i > 0) break; // trailing '' after final \n
    lines.push({ s: raw[i], eol });
  }
  if (lines.length === 0) lines.push({ s: '', eol: false });
  return lines;
}

function newNode(t, parent) {
  const n = { t, children: [], parent, text: '', lines: [], blankRun: 0 };
  if (parent) parent.children.push(n);
  return n;
}

class BP {
  constructor(lines) {
    this.lines = lines;
    this.root = { t: 'doc', children: [], parent: null, text: '' };
    this.stack = [this.root];
    this.pendingBlank = false;
    this.blankContainer = null;
    this.blankIsReal = false;
  }

  run() {
    for (let li = 0; li < this.lines.length; li++) this.line(this.lines[li]);
    this.atEof = true;
    while (this.stack.length > 1) this.closeBlock(this.stack.pop());
    return this.root;
  }

  // Finalise a block that is being closed.
  closeBlock(b) {
    // A blank line ends an item when it is real (raw blank) or when it
    // occurred directly in that item (cm-320: an empty blockquote line
    // inside a quote does not end the enclosing item).
    if (b.t === 'item' && this.pendingBlank &&
        (this.blankIsReal || this.blankContainer === b)) b.endsBlank = true;
    // An HTML block that is the last child of a container ending
    // mid-document loses its trailing newline (cm-175: "<div>" in a
    // list item whose next item starts). At EOF it keeps it (cm-167).
    if (!this.atEof && (b.t === 'item' || b.t === 'quote')) {
      const kids = b.children;
      const last = kids[kids.length - 1];
      if (last && last.t === 'html') last.endedByBlank = true;
    }
    if (b.t === 'code' && !b.fenced) {
      // Strip trailing source-blank lines from indented code, then join.
      const ls = b.lines;
      if (b.blankRun > 0) { ls.length -= b.blankRun; b.blankRun = 0; }
      b.text = ls.join('');
    }
    if (b.t === 'list') {
      // Tight unless an item contains a blank line between two of its
      // child blocks, or an item ends with a blank line and another
      // item follows. A blank line after the LAST item (before content
      // outside the list) does not loosen it (cm-255/257/276).
      b.tight = true;
      for (let k = 0; k < b.children.length; k++) {
        const item = b.children[k];
        if (item.blankBetween) { b.tight = false; break; }
        if (item.endsBlank && k < b.children.length - 1) { b.tight = false; break; }
      }
    }
  }

  // Record that a new child block is starting in container c.
  childStarted(c) {
    // A real blank line loosens whatever container the next block starts
    // in. An empty-container line (">") only loosens the container it
    // occurred in or a descendant of it (cm-320 vs doc-04 vs cm-325).
    if (this.pendingBlank && c.children.length > 0 &&
        (this.blankIsReal || this.blankInScope(c))) c.blankBetween = true;
    this.pendingBlank = false;
    this.blankContainer = null;
  }

  // True if c is the container the pending blank line occurred in, or
  // a descendant of it.
  blankInScope(c) {
    let x = c;
    while (x) {
      if (x === this.blankContainer) return true;
      x = x.parent;
    }
    return false;
  }

  // Add a raw line (with its newline if any) to a leaf block's text.
  addRaw(b, text, eol) {
    b.text += text;
    if (eol) b.text += '\n';
  }

  // Add a line to a paragraph (lines joined by '\n', no trailing newline).
  addPara(b, text) {
    if (b.text.length > 0) b.text += '\n';
    b.text += text;
  }

  line(L) {
    const c = curOf(L);
    this.markerSpace = false;
    this.quoteCol = 0;
    // Whether the raw line (before any container marker is consumed)
    // is blank. Only a real blank line counts for list tightness.
    this.rawBlank = cIsBlank(c);
    // ---- Phase 1a: match open containers.
    let idx = 1;
    let matchedAll = true;
    while (idx < this.stack.length) {
      const b = this.stack[idx];
      if (b.t === 'list') {
        // A list consumes no input; it always matches.
        idx++;
        continue;
      }
      if (b.t === 'quote') {
        const si = c.i, scol = c.col, stab = c.tab;
        cSkip(c, 3);
        if (cPeek(c) === '>') {
          this.quoteCol = c.col; // column of this ">" (innermost wins)
          cAdv(c);
          const nx = cPeek(c);
          if (nx === ' ' || nx === '\t') { cAdv1(c); this.markerSpace = true; }
          idx++;
          continue;
        }
        c.i = si; c.col = scol; c.tab = stab;
        matchedAll = false;
        break;
      }
      if (b.t === 'item') {
        if (cIsBlank(c)) { idx++; continue; }
        // An empty item does not continue after a blank line (cm-280:
        // "-\n\n  foo" leaves "foo" outside the list).
        if (this.pendingBlank && b.children.length === 0) {
          matchedAll = false;
          break;
        }
        const need = b.indent - c.col;
        if (need <= 0) { idx++; continue; }
        // Restore the cursor if the item does not match: the spaces
        // skipped here belong to the line, not to the item (cm-255:
        // " two" keeps its space as a top-level paragraph; cm-257:
        // "     two" stays indented code).
        const si = c.i, scol = c.col, stab = c.tab;
        cSkip(c, need);
        if (c.col >= b.indent) { idx++; continue; }
        c.i = si; c.col = scol; c.tab = stab;
        matchedAll = false;
        break;
      }
      break; // leaf block at the tip
    }
    const container = this.stack[idx - 1];
    const tip = this.stack[this.stack.length - 1];
    // A line is blank unless a blockquote marker consumed a space and
    // text remains (even only spaces) while continuing a paragraph:
    // ">  " contributes a space to the paragraph (cm-241), while ">"
    // and "> " are blank — but only when a paragraph is open; an empty
    // blockquote contributes nothing (cm-240).
    const blank = cIsBlank(c) &&
      !(this.markerSpace && c.i < c.s.length && tip.t === 'para');

    // ---- Blank line.
    if (blank) {
      if (matchedAll) {
        if (tip.t === 'table' && c.s.slice(c.i).includes('\t')) {
          // A whitespace-only line containing a tab inside a table is a
          // row of empty cells, not a table-ending blank line (doc-02:
          // a lone "\t" line becomes a row of six empty cells). A truly
          // empty line still ends the table.
          cSkip(c, 3);
          tip.rows.push(splitTableRow(cRest(c)));
          return;
        }
            if (tip.t === 'code' && tip.fenced) {
          // Blank lines are content of fenced code (fence indent stripped).
          cSkip(c, tip.fenceIndent);
          this.addRaw(tip, cRest(c), L.eol);
          return;
        }
        if (tip.t === 'code' && !tip.fenced) {
          // Blank line inside indented code: strip up to 4 columns.
          cSkip(c, 4);
          const rest = cRest(c);
          tip.lines.push(rest + (L.eol ? '\n' : ''));
          tip.blankRun = (tip.blankRun || 0) + 1;
          return;
        }
        if (tip.t === 'html' && tip.endType !== 'blank') {
          // Blank line is content of a type 1-5 HTML block.
          this.addRaw(tip, cRest(c), L.eol);
          return;
        }
      }
      // Structural blank: an HTML block (type 6/7) closed here loses its
      // trailing newline; close leaf blocks, remember the blank. But only
      // a TRULY EMPTY line counts (doc-15: a lone "\t" after "-->" keeps
      // the newline; doc-19: a 3-space line keeps it; cm-183's empty
      // line drops it).
      const blankIsEmpty = c.i >= c.s.length;
      for (let k = this.stack.length - 1; k >= idx; k--) {
        const b = this.stack[k];
        if (b.t === 'html' && b.endType === 'blank' && blankIsEmpty) b.endedByBlank = true;
      }
      // An HTML block that ended on the previous line and is followed
      // by this blank line also loses its trailing newline, for any
      // block type (cm-183: a comment block "  <!-- foo -->" before a
      // blank line). It is the last child of the innermost container.
      const parent = this.stack[idx - 1];
      if (parent) {
        const kids = parent.children;
        const last = kids[kids.length - 1];
        if (last && last.t === 'html' && blankIsEmpty) last.endedByBlank = true;
      }
      while (this.stack.length > idx) this.closeBlock(this.stack.pop());
      this.pendingBlank = true;
      // A real blank line (raw blank) loosens any container; an
      // empty-container line (">") only loosens its own container or a
      // descendant (cm-320 vs doc-04 vs cm-325).
      this.blankIsReal = this.rawBlank;
      this.blankContainer = null;
      for (let k = this.stack.length - 1; k >= 0; k--) {
        const t = this.stack[k].t;
        if (t === 'doc' || t === 'list' || t === 'item' || t === 'quote') {
          this.blankContainer = this.stack[k];
          break;
        }
      }
      return;
    }

    // ---- Leaf blocks that consume lines directly (all containers matched).
    const tipIdx = this.stack.length - 1;
    // A fenced code block consumes its content lines even when a
    // list-item container does not match (doc-02: an unindented
    // "function f(a, b) {" line inside a fenced block in a list item
    // stays code). But a line that fails to match a BLOCKQUOTE
    // container is NOT code (doc-40: a line without ">" ends the
    // blockquote and the fence inside it, starting a paragraph). And
    // an EMPTY fence (no content yet) does not claim a line that
    // misses its container (doc-17: the first line after "```toml",
    // unindented, is a paragraph, leaving an empty toml block).
    let unmatchedQuote = false;
    for (let k = idx; k < tipIdx; k++) {
      if (this.stack[k].t === 'quote') { unmatchedQuote = true; break; }
    }
    const fencedLenient = !unmatchedQuote && (tip.text.length > 0 || idx === tipIdx);
    if (tip.t === 'code' && tip.fenced && fencedLenient) {
      // Inside a fenced code block: closing fence or content.
      const save = { i: c.i, col: c.col, tab: c.tab };
      cSkip(c, 3);
      const ch = cPeek(c);
      if (ch === tip.fenceCh) {
        let n = 0;
        while (cPeek(c) === tip.fenceCh) { cAdv(c); n++; }
        if (n >= tip.fenceLen && cIsBlank(c)) {
          // A fenced code block's content loses one trailing newline
          // when the last content line was empty (cm-318: "b" + 2 blank
          // lines is "b\n\n", not "b\n\n\n"; doc-01 same). A trailing
          // line with only spaces is kept (cm-129: "\n  \n"). When the
          // ONLY content line is empty (text is just "\n"), it is
          // stripped too (doc-15: an empty rust block is "").
          if (tip.text.endsWith('\n\n') || tip.text === '\n') tip.text = tip.text.slice(0, -1);
          this.closeBlock(this.stack.pop());
          return;
        }
      }
      c.i = save.i; c.col = save.col; c.tab = save.tab;
      cSkip(c, tip.fenceIndent);
      // If any indent was stripped (container prefix and/or fence indent)
      // and the content starts with a tab, the tab expands to spaces
      // (doc-01: 13 spaces + tab becomes 3 spaces, to column 16). At
      // column 0 with nothing stripped, a leading tab is kept literal
      // (doc-01 toml block: "\tindented" stays "\t"). Inside a
      // blockquote, the tab stop is measured relative to the ">"
      // (doc-14: "\t      > \tindented", ">" at col 10, tab at col 12
      // -> 2 spaces; doc-12: "    > \tindented", ">" at col 4, tab at
      // col 6 -> 2 spaces; doc-02: ">   \tindented", ">" at col 0, tab
      // at col 4 -> 4 spaces).
      if (c.col > 0 && c.tab === 0 && c.s[c.i] === '\t') {
        const effCol = this.markerSpace ? c.col - this.quoteCol : c.col;
        c.tab = 4 - (effCol % 4);
      }
      this.addRaw(tip, cRest(c), L.eol);
      return;
    }
    if (tip.t === 'code' && !tip.fenced && idx === tipIdx) {
      // Inside an indented code block: needs 4+ columns of indent.
      if (cSpaces(c) >= 4) {
        cSkip(c, 4);
        tip.lines.push(cRest(c) + (L.eol ? '\n' : ''));
        tip.blankRun = 0;
        return;
      }
      // Otherwise the code block ends; fall through to close + new blocks.
    }
    if (tip.t === 'html' && idx === tipIdx) {
      // Inside an HTML block: add the line, check the end condition.
      const rest = cRest(c);
      this.addRaw(tip, rest, L.eol);
      if (this.htmlEnds(tip, rest)) this.closeBlock(this.stack.pop());
      return;
    }
    if (tip.t === 'table' && idx === tipIdx) {
      // Inside a table: a further row, unless the line starts a new block.
      if (this.tableRowLine(c)) {
        cSkip(c, 3);
        tip.rows.push(splitTableRow(cRest(c)));
        return;
      }
      // Otherwise the table ends; fall through to close + new blocks.
    }

    // ---- Lazy continuation of a paragraph.
    if (!matchedAll && tip.t === 'para') {
      // A list marker ends the paragraph as a new item, even an empty
      // one or one that cannot interrupt (cm-281/282/283/302/315/278:
      // "- foo\n-" starts a new empty item, it is not paragraph text).
      const b0 = this.scanBlockStart(c);
      if (!(b0 && b0.kind === 'list') && !this.isInterrupting(c)) {
        // A lazy line loses its leading indentation (cm-238: "    - bar"
        // becomes "- bar"; cm-312: "    - e" becomes "- e"). But a tab
        // partially consumed by container matching (c.tab > 0) expands
        // to spaces that are CONTENT, not indentation (doc-25: a lazy
        // "\tfn main()" keeps one space from the tab's remainder).
        let text;
        if (c.tab > 0) {
          text = ' '.repeat(c.tab) + c.s.slice(c.i + 1).replace(/^[ \t]+/, '');
        } else {
          text = cRest(c).replace(/^[ \t]+/, '');
        }
        if (isSetextLine(text)) text = '    ' + text;
        this.addPara(tip, text);
        this.pendingBlank = false;
        return;
      }
    }

    // ---- Close unmatched blocks, then start new blocks.
    // When every container matched and the tip is a paragraph, leave the
    // paragraph on the stack: addBlocks' para-tip branch decides whether
    // the line continues it (setext / table / plain continuation) or
    // closes it for a new block. Closing it here would split every
    // multi-line paragraph into one paragraph per line.
    if (!(matchedAll && tip.t === 'para')) {
      while (this.stack.length > idx) this.closeBlock(this.stack.pop());
    }
    this.addBlocks(c, L);
  }

  // HTML block end conditions (checked per added line).
  htmlEnds(b, line) {
    switch (b.endType) {
      case 'tag': return b.endRe.test(line);
      case 'comment': return line.indexOf('-->') !== -1;
      case 'pi': return line.indexOf('?>') !== -1;
      case 'decl': return line.indexOf('>') !== -1;
      case 'cdata': return line.indexOf(']]>') !== -1;
      default: return false;
    }
  }

}

// ---------------------------------------------------------------------------
// HTML tag scanner (shared by block HTML and inline HTML).
// scanTag(s, i, end): s[i] === '<'. Returns the index just past '>' or -1.
// ---------------------------------------------------------------------------
function isAsciiLetter(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
function isTagNameChar(c) {
  return isAsciiLetter(c) || (c >= 48 && c <= 57) || c === 45;
}
function isAttrNameStart(c) {
  return isAsciiLetter(c) || c === 95 || c === 58;
}
function isAttrNameChar(c) {
  return isAsciiLetter(c) || (c >= 48 && c <= 57) || c === 95 || c === 58 ||
    c === 46 || c === 45;
}

function scanTag(s, i, end) {
  if (s[i] !== '<') return -1;
  let j = i + 1;
  if (j < end && s[j] === '!') {
    if (s.startsWith('<!--', i)) {
      // Abruptly closed comments: "<!-->" (empty) and "<!--->" ("-")
      // are complete comments ending at the '>' (cm-626); the text
      // after them is separate (a trailing "-->" is escaped text).
      if (s[i + 4] === '>') return i + 5;
      if (s[i + 4] === '-' && s[i + 5] === '>') return i + 6;
      const k = s.indexOf('-->', i + 4);
      if (k === -1 || k >= end) return -1;
      // A comment's text must not end with '-'.
      if (s[k - 1] === '-') return -1;
      return k + 3;
    }
    if (s.startsWith('<![CDATA[', i)) {
      const k = s.indexOf(']]>', i + 9);
      return (k === -1 || k >= end) ? -1 : k + 3;
    }
    if (j + 1 < end && isAsciiLetter(s.charCodeAt(j + 1))) {
      const k = s.indexOf('>', j + 1);
      return (k === -1 || k >= end) ? -1 : k + 1;
    }
    return -1;
  }
  if (j < end && s[j] === '?') {
    const k = s.indexOf('?>', j + 1);
    return (k === -1 || k >= end) ? -1 : k + 2;
  }
  let closing = false;
  if (j < end && s[j] === '/') { closing = true; j++; }
  if (j >= end || !isAsciiLetter(s.charCodeAt(j))) return -1;
  while (j < end && isTagNameChar(s.charCodeAt(j))) j++;
  if (closing) {
    while (j < end && (s[j] === ' ' || s[j] === '\t')) j++;
    return (j < end && s[j] === '>') ? j + 1 : -1;
  }
  for (;;) {
    // Whitespace is required before each attribute (and allowed before
    // '>' or '/>'). Without it the tag is invalid (cm-609 "<m:abc>";
    // cm-622 "<a href='bar'title=title>").
    let ws = 0;
    while (j < end && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) { j++; ws++; }
    if (j >= end) return -1;
    if (s[j] === '>') return j + 1;
    if (s[j] === '/' && j + 1 < end && s[j + 1] === '>') return j + 2;
    if (ws === 0) return -1;
    if (!isAttrNameStart(s.charCodeAt(j))) return -1;
    while (j < end && isAttrNameChar(s.charCodeAt(j))) j++;
    // Spaces after the name are only consumed to find '='. If no '='
    // follows, the attribute is boolean and the spaces belong to the
    // separator before the next attribute (cm-616: "_boolean zoop:..."
    // — consuming them here left ws === 0 and rejected the tag).
    let k = j;
    while (k < end && (s[k] === ' ' || s[k] === '\t')) k++;
    if (k < end && s[k] === '=') {
      j = k + 1;
      while (j < end && (s[j] === ' ' || s[j] === '\t')) j++;
      if (j < end && (s[j] === '"' || s[j] === "'")) {
        const q = s[j];
        j++;
        while (j < end && s[j] !== q) j++;
        if (j >= end) return -1;
        j++;
      } else {
        let n = 0;
        while (j < end) {
          const cc = s.charCodeAt(j);
          if (cc === 32 || cc === 9 || cc === 10 || cc === 34 || cc === 39 ||
            cc === 61 || cc === 60 || cc === 62 || cc === 96) break;
          j++; n++;
        }
        if (n === 0) return -1;
      }
    }
  }
}

// Block-level tag names for HTML block type 6 (CommonMark list plus the
// GFM "disallowed raw HTML" raw-text elements xmp / noembed / plaintext).
const BLOCK_TAGS = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|noembed|ol|optgroup|option|p|param|plaintext|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul|xmp';
const BLOCK_TAG_RE = new RegExp('^<\\/?(?:' + BLOCK_TAGS + ')(?=[\\s>\\/]|$)', 'i');
const TYPE1_RE = /^<(script|pre|style|textarea)(?=[\s>\/]|$)/i;

// Is this line (no trailing newline) a setext heading underline?
function isSetextLine(text) {
  let i = 0;
  while (i < 3 && text[i] === ' ') i++;
  const ch = text[i];
  if (ch !== '=' && ch !== '-') return false;
  let j = i;
  while (text[j] === ch) j++;
  while (text[j] === ' ' || text[j] === '\t') j++;
  return j === text.length;
}

// Split a table row (or delimiter/header line) into cells on unescaped '|'
// outside code spans. Leading/trailing pipes drop an empty edge cell.
function splitTableRow(line) {
  const cells = [];
  let cur = '';
  let i = 0;
  const n = line.length;
  let span = 0; // open code-span run length (0 = not inside one)
  while (i < n) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < n && isAsciiPunctCode(line.charCodeAt(i + 1))) {
      // "\|" is an escaped pipe: it does not split the row, and the
      // backslash is consumed (gfm-200: "`\|`" in a cell is <code>|</code>,
      // "**\|**" is <strong>|</strong>).
      if (line[i + 1] === '|') { cur += '|'; i += 2; continue; }
      cur += line[i] + line[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      let run = 0;
      while (i + run < n && line[i + run] === '`') run++;
      if (span === 0) {
        // Only enter span mode if a closing run of the SAME length exists
        // ahead; otherwise the backticks are literal and '|' still splits
        // (doc-06: "``next`" has a 2-run opener but only a 1-run closer).
        let j = i + run, found = false;
        while (j < n) {
          if (line[j] === '`') {
            let r2 = 0;
            while (j + r2 < n && line[j + r2] === '`') r2++;
            if (r2 === run) { found = true; break; }
            j += r2;
          } else j++;
        }
        if (found) span = run;
      } else if (run === span) span = 0;
      cur += line.slice(i, i + run);
      i += run;
      continue;
    }
    if (ch === '|' && span === 0) {
      cells.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  cells.push(cur);
  // Drop the empty edge cells produced by a leading / trailing pipe.
  let start = 0, end = cells.length;
  let k = 0;
  while (k < n && (line[k] === ' ' || line[k] === '\t')) k++;
  if (k < n && line[k] === '|') start = 1;
  k = n - 1;
  while (k >= 0 && (line[k] === ' ' || line[k] === '\t')) k--;
  if (k >= 0 && line[k] === '|' && end > start) end--;
  const out = [];
  for (let q = start; q < end; q++) out.push(cells[q].trim());
  return out;
}

// Process a fenced-code info string: backslash escapes, trim, first word.
function processInfo(raw) {
  let s = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length && isAsciiPunctCode(raw.charCodeAt(i + 1))) {
      s += raw[i + 1];
      i++;
    } else s += ch;
  }
  s = s.trim();
  const m = /^\S+/.exec(s);
  return m ? m[0] : '';
}

// ---- BP methods (continued) -----------------------------------------------

// Scan a list marker at the cursor copy d (already past up to 3 spaces).
// Returns null or {ordered, bullet, delim, start, markerCol, markerLen,
// contentIndent, empty, units, use}.
BP.prototype.scanListMarker = function (d) {
  const startCol = d.col;
  const ch = cPeek(d);
  let ordered = false, bullet = null, delim = null, startNum = 0;
  if (ch === '-' || ch === '+' || ch === '*') {
    bullet = ch;
    cAdv(d);
  } else if (ch >= '0' && ch <= '9') {
    let n = 0, num = 0;
    while (true) {
      const cc = cPeek(d);
      if (cc >= '0' && cc <= '9') {
        num = num * 10 + (cc.charCodeAt(0) - 48);
        cAdv(d);
        n++;
        if (n > 9) return null;
      } else break;
    }
    if (n === 0) return null;
    const dl = cPeek(d);
    if (dl !== '.' && dl !== ')') return null;
    delim = dl;
    startNum = num;
    ordered = true;
    cAdv(d);
  } else return null;
  const nx = cPeek(d);
  if (nx !== ' ' && nx !== '\t' && nx !== undefined) return null;
  const markerLen = d.col - startCol;
  const units = cUnits(d);
  const use = units === 0 ? 0 : (units <= 4 ? units : 1);
  for (let k = 0; k < use; k++) cAdv1(d);
  const empty = cIsBlank(d);
  // An empty item's content starts right after the marker (cm-279:
  // "-   \n  foo" puts "foo" in the item, content indent 2).
  const contentIndent = empty ? startCol + markerLen + 1 :
    startCol + markerLen + (units === 0 ? 1 : (units <= 4 ? units : 1));
  return {
    ordered, bullet, delim, start: startNum, markerCol: startCol,
    markerLen, contentIndent, empty, units, use,
  };
};

// Consume a list marker (already scanned) on the real cursor.
BP.prototype.consumeListMarker = function (c, info) {
  cSkip(c, info.markerCol - c.col);
  if (info.ordered) {
    while (cPeek(c) >= '0' && cPeek(c) <= '9') cAdv(c);
    cAdv(c); // delimiter
  } else {
    cAdv(c); // bullet
  }
  for (let k = 0; k < info.use; k++) cAdv1(c);
};

// Scan an HTML block start at the cursor copy d (d is at '<').
BP.prototype.scanHtmlStart = function (d) {
  const line = d.s.slice(d.i);
  if (line.startsWith('<!--')) return { endType: 'comment' };
  if (line.startsWith('<?')) return { endType: 'pi' };
  if (line.startsWith('<![CDATA[')) return { endType: 'cdata' };
  if (line.startsWith('<!') && line.length > 2 && isAsciiLetter(line.charCodeAt(2))) {
    return { endType: 'decl' };
  }
  const m1 = TYPE1_RE.exec(line);
  if (m1) return { endType: 'tag', endTag: m1[1].toLowerCase() };
  if (BLOCK_TAG_RE.test(line)) return { endType: 'blank' };
  // Type 7: a complete tag alone on the line.
  const end = scanTag(d.s, d.i, d.s.length);
  if (end !== -1) {
    let k = end;
    while (k < d.s.length && (d.s[k] === ' ' || d.s[k] === '\t')) k++;
    if (k === d.s.length) return { endType: 'blank', type7: true };
  }
  return null;
};

// Scan for a block start at the cursor (up to 3 leading spaces allowed).
// Returns null or a descriptor. Does not mutate the cursor.
BP.prototype.scanBlockStart = function (c) {
  const d = { s: c.s, i: c.i, col: c.col, tab: c.tab };
  if (cSpaces(d) >= 4) return { kind: 'indented' };
  cSkip(d, 3);
  const ch = cPeek(d);
  if (ch === undefined) return null;
  if (ch === '>') return { kind: 'quote' };
  if (ch === '#') {
    let n = 0;
    while (cPeek(d) === '#') { cAdv(d); n++; }
    if (n >= 1 && n <= 6) {
      const nx = cPeek(d);
      if (nx === ' ' || nx === '\t' || nx === undefined) return { kind: 'atx', level: n };
    }
    return null;
  }
  if (ch === '`' || ch === '~') {
    let n = 0;
    while (cPeek(d) === ch) { cAdv(d); n++; }
    if (n >= 3) return { kind: 'fence', ch, len: n };
    return null;
  }
  if (ch === '*' || ch === '-' || ch === '_') {
    // Thematic break: only this char and spaces/tabs, 3+ markers.
    let n = 0, k = d.i, tab = d.tab, ok = true;
    const s = d.s;
    while (k < s.length) {
      const cc = tab > 0 ? ' ' : s[k];
      if (cc === ch) {
        n++;
        if (tab > 0) { tab--; if (tab === 0) k++; } else k++;
      } else if (cc === ' ' || cc === '\t') {
        if (tab > 0) { tab--; if (tab === 0) k++; } else k++;
      } else { ok = false; break; }
    }
    if (ok && n >= 3) return { kind: 'hr' };
    // Not an hr: could still be a list marker ('-' / '*').
    if (ch === '*' || ch === '-') {
      const lm = this.scanListMarker(d);
      if (lm) return { kind: 'list', ...lm };
    }
    return null;
  }
  if (ch === '<') {
    const h = this.scanHtmlStart(d);
    if (h) return { kind: 'html', ...h };
    return null;
  }
  if (ch === '+' || (ch >= '0' && ch <= '9')) {
    const lm = this.scanListMarker(d);
    if (lm) return { kind: 'list', ...lm };
    return null;
  }
  return null;
};

// Does the line at the cursor start a block that can interrupt a paragraph?
BP.prototype.isInterrupting = function (c) {
  const b = this.scanBlockStart(c);
  if (!b) return false;
  if (b.kind === 'indented') return false;
  if (b.kind === 'html' && b.type7) return false;
  if (b.kind === 'list') return !b.empty && (!b.ordered || b.start === 1);
  return true;
};

// Can this line be a further table row?
BP.prototype.tableRowLine = function (c) {
  if (cSpaces(c) >= 4) return false;
  const b = this.scanBlockStart(c);
  if (!b) return true;
  if (b.kind === 'indented') return false;
  if (b.kind === 'html' && b.type7) return true;
  return false;
};

// Try to turn the tip paragraph into a setext heading. Returns true if done.
BP.prototype.trySetext = function (c) {
  const para = this.stack[this.stack.length - 1];
  if (para.t !== 'para') return false;
  // A paragraph that is only link reference definitions cannot become
  // a setext heading: the underline is paragraph text instead
  // (cm-216: "[foo]: /url\n===" stays a paragraph; cm-215 keeps the
  // heading because "bar" remains after the definition).
  const defsEnd = leadingDefsEnd(para.text);
  if (defsEnd > 0 && para.text.slice(defsEnd).replace(/^[ \t\n]+/, '') === '') return false;
  const d = { s: c.s, i: c.i, col: c.col, tab: c.tab };
  cSkip(d, 3);
  const ch = cPeek(d);
  if (ch !== '=' && ch !== '-') return false;
  let n = 0;
  while (cPeek(d) === ch) { cAdv(d); n++; }
  if (n === 0 || !cIsBlank(d)) return false;
  const h = newNode('heading', null);
  h.parent = para.parent;
  h.level = ch === '=' ? 1 : 2;
  h.text = para.text.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
  const sibs = para.parent.children;
  sibs[sibs.indexOf(para)] = h;
  this.stack.pop();
  this.pendingBlank = false;
  return true;
};

// Try to turn the tip paragraph into a table. Returns true if done.
BP.prototype.tryTable = function (c) {
  const para = this.stack[this.stack.length - 1];
  if (para.t !== 'para') return false;
  const d = { s: c.s, i: c.i, col: c.col, tab: c.tab };
  cSkip(d, 3);
  // More than 3 leading spaces: indented, not a table delimiter row.
  if (cPeek(d) === ' ' || cPeek(d) === '\t') return false;
  const rest = cRest(d);
  const delim = splitTableRow(rest);
  if (delim.length === 0) return false;
  for (const cell of delim) {
    if (!/^:?-+:?$/.test(cell)) return false;
  }
  const header = splitTableRow(para.text);
  if (header.length !== delim.length) return false;
  const aligns = delim.map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (left) return 'left';
    if (right) return 'right';
    return null;
  });
  const t = newNode('table', null);
  t.parent = para.parent;
  t.header = header;
  t.aligns = aligns;
  t.rows = [];
  const sibs = para.parent.children;
  sibs[sibs.indexOf(para)] = t;
  this.stack.pop();
  this.stack.push(t);
  this.pendingBlank = false;
  return true;
};

// Phase 1b: start new blocks at the cursor.
BP.prototype.addBlocks = function (c, L) {
  for (;;) {
    // A line is blank unless a blockquote marker consumed a space and
    // text remains (even only spaces) — see line()'s blank computation
    // (cm-241: ">  " contributes a space to the paragraph; cm-240: an
    // empty blockquote contributes nothing, so this only applies while
    // continuing a paragraph).
    const tip0 = this.stack[this.stack.length - 1];
    if (cIsBlank(c) && !(this.markerSpace && c.i < c.s.length && tip0 && tip0.t === 'para')) return;
    const tip = this.stack[this.stack.length - 1];
    if (tip.t === 'para') {
      if (this.trySetext(c)) return;
      if (this.tryTable(c)) return;
      const b = this.scanBlockStart(c);
      // An ordered list not starting with 1 does not interrupt a
      // paragraph (cm-304: "14." after text stays paragraph text) —
      // except when the paragraph is inside a list item, where a
      // sub-list may start with any number (doc-01: "505791." inside
      // an item starts an <ol start="505791">).
      if (!b || b.kind === 'indented' || (b.kind === 'html' && b.type7) ||
          (b.kind === 'list' && (b.empty || (b.ordered && b.start !== 1 && tip.parent.t !== 'item')))) {
        this.addPara(tip, cRest(c));
        this.pendingBlank = false;
        return;
      }
      this.closeBlock(this.stack.pop());
      continue;
    }
    const b = this.scanBlockStart(c);
    // A non-list block at the list level closes the list: an hr, heading,
    // fence, html block, quote or paragraph after a list item (at an
    // indent below the item's content indent) belongs to the list's
    // parent, not to the list (cm-057/060/094/099: "- foo\n***" puts
    // the <hr> at top level, then a new list may follow).
    if (tip.t === 'list' && (!b || b.kind !== 'list')) {
      this.closeBlock(this.stack.pop());
      continue;
    }
    if (!b) {
      const p = newNode('para', tip);
      this.childStarted(tip);
      this.stack.push(p);
      this.addPara(p, cRest(c));
      this.pendingBlank = false;
      return;
    }
    if (b.kind === 'indented') {
      const code = newNode('code', tip);
      code.fenced = false;
      this.childStarted(tip);
      this.stack.push(code);
      cSkip(c, 4);
      code.lines.push(cRest(c) + (L.eol ? '\n' : ''));
      code.blankRun = 0;
      this.pendingBlank = false;
      return;
    }
    if (b.kind === 'quote') {
      const q = newNode('quote', tip);
      this.childStarted(tip);
      this.stack.push(q);
      cSkip(c, 3);
      cAdv(c); // '>'
      const nx = cPeek(c);
      if (nx === ' ' || nx === '\t') cAdv1(c);
      continue;
    }
    if (b.kind === 'list') {
      let list = null;
      if (tip.t === 'list' && tip.ordered === b.ordered &&
          (b.ordered ? tip.delim === b.delim : tip.bullet === b.bullet)) {
        list = tip;
      } else {
        if (tip.t === 'list') this.closeBlock(this.stack.pop());
        list = newNode('list', this.stack[this.stack.length - 1]);
        list.ordered = b.ordered;
        list.bullet = b.bullet;
        list.delim = b.delim;
        list.start = b.start;
        this.childStarted(list.parent);
        this.stack.push(list);
      }
      const item = newNode('item', list);
      item.indent = b.contentIndent;
      this.childStarted(list);
      this.stack.push(item);
      this.consumeListMarker(c, b);
      continue;
    }
    if (b.kind === 'fence') {
      const save = { i: c.i, col: c.col, tab: c.tab };
      const col0 = c.col;
      cSkip(c, 3);
      const fenceIndent = c.col - col0;
      let n = 0;
      while (cPeek(c) === b.ch) { cAdv(c); n++; }
      const infoRaw = cRest(c);
      if (b.ch === '`' && infoRaw.indexOf('`') !== -1) {
        // Not a fence: a backtick fence's info string may not contain '`'.
        c.i = save.i; c.col = save.col; c.tab = save.tab;
        const p = newNode('para', tip);
        this.childStarted(tip);
        this.stack.push(p);
        this.addPara(p, cRest(c));
        this.pendingBlank = false;
        return;
      }
      const code = newNode('code', tip);
      code.fenced = true;
      code.fenceCh = b.ch;
      code.fenceLen = n;
      code.fenceIndent = fenceIndent;
      code.lang = processInfo(infoRaw);
      this.childStarted(tip);
      this.stack.push(code);
      this.pendingBlank = false;
      return;
    }
    if (b.kind === 'atx') {
      const h = newNode('heading', tip);
      h.level = b.level;
      this.childStarted(tip);
      cSkip(c, 3);
      while (cPeek(c) === '#') cAdv(c);
      while (cPeek(c) === ' ' || cPeek(c) === '\t') cAdv1(c);
      let content = cRest(c);
      content = content.replace(/[ \t]+$/, '');
      const m = /^(.*?)[ \t]+#+$/.exec(content);
      if (m) content = m[1];
      else if (/^#+$/.test(content)) content = '';
      h.text = content;
      this.pendingBlank = false;
      return;
    }
    if (b.kind === 'hr') {
      newNode('hr', tip);
      this.childStarted(tip);
      this.pendingBlank = false;
      return;
    }
    if (b.kind === 'html') {
      const html = newNode('html', tip);
      html.endType = b.endType;
      html.endTag = b.endTag || null;
      html.type7 = !!b.type7;
      html.endedByBlank = false;
      if (b.endType === 'tag') {
        html.endRe = new RegExp('</' + b.endTag + '(?=[\\s>]|$)', 'i');
      }
      this.childStarted(tip);
      const rest = cRest(c);
      this.addRaw(html, rest, L.eol);
      if (b.endType !== 'blank' && this.htmlEnds(html, rest)) {
        this.pendingBlank = false;
        return;
      }
      this.stack.push(html);
      this.pendingBlank = false;
      return;
    }
    return;
  }
};

// ---------------------------------------------------------------------------
// Phase 2: link reference definitions
// ---------------------------------------------------------------------------

function skipSpacesTabs(text, i) {
  const n = text.length;
  while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
  return i;
}

// Skip spaces/tabs and at most one newline (plus spaces/tabs after it).
function skipWs1(text, i) {
  const n = text.length;
  while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
  if (i < n && text[i] === '\n') {
    i++;
    while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
  }
  return i;
}

function unescapeBackslashes(s) {
  if (s.indexOf('\\') === -1) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && isAsciiPunctCode(s.charCodeAt(i + 1))) {
      out += s[i + 1];
      i++;
    } else out += ch;
  }
  return out;
}

// Parse a link reference definition at text[pos] === '['.
// Returns {label, dest, title, end} or null.
function parseLinkDef(text, pos) {
  const n = text.length;
  let i = pos;
  if (text[i] !== '[') return null;
  i++;
  let label = '';
  let closed = false;
  while (i < n) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < n && isAsciiPunctCode(text.charCodeAt(i + 1))) {
      // Keep the backslash: the label is the raw text (see cm-545).
      label += text[i];
      label += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === '[') return null;
    if (ch === ']') { closed = true; i++; break; }
    label += ch;
    i++;
  }
  if (!closed) return null;
  const norm = normalizeLabel(label);
  if (norm.length === 0) return null;
  if (i >= n || text[i] !== ':') return null;
  i++;
  i = skipWs1(text, i);
  if (i >= n) return null;
  let dest = '';
  if (text[i] === '<') {
    i++;
    let j = i;
    while (j < n && text[j] !== '>' && text[j] !== '\n') {
      if (text[j] === '<') return null;
      j++;
    }
    if (j >= n || text[j] !== '>') return null;
    dest = unescapeBackslashes(text.slice(i, j));
    i = j + 1;
  } else {
    let j = i, depth = 0;
    while (j < n) {
      const ch = text[j];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break;
      const cc = text.charCodeAt(j);
      if (cc < 32 || cc === 127) break;
      if (ch === '\\' && j + 1 < n && isAsciiPunctCode(text.charCodeAt(j + 1))) {
        j += 2;
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) break;
        depth--;
      }
      j++;
    }
    if (j === i) return null;
    dest = unescapeBackslashes(text.slice(i, j));
    i = j;
  }
  // After the destination: whitespace, then optionally a title (same
  // line or next line), then the end of the line.
  const destEnd = i;
  const beforeWs = i;
  i = skipWs1(text, i);
  let title = null;
  if (i < n && (text[i] === '"' || text[i] === "'" || text[i] === '(')) {
    // A title must be separated from the destination by whitespace
    // (cm-201: "[foo]: <bar>(baz)" is not a definition — no space
    // before "(baz)").
    if (i === beforeWs) return null;
    const q = text[i];
    const close = q === '(' ? ')' : q;
    i++;
    let j = i, ok = false;
    while (j < n) {
      const ch = text[j];
      if (ch === '\\' && j + 1 < n && isAsciiPunctCode(text.charCodeAt(j + 1))) {
        j += 2;
        continue;
      }
      if (ch === '\n' && text[j + 1] === '\n') return null;
      if (ch === close) { ok = true; break; }
      if (q === '(' && ch === '(') return null;
      j++;
    }
    if (!ok) return null;
    title = unescapeBackslashes(text.slice(i, j));
    const afterTitle = skipSpacesTabs(text, j + 1);
    if (afterTitle < n && text[afterTitle] !== '\n') {
      // The title is followed by more content on its line (cm-210:
      // "[foo]: /url\n\"title\" ok") — not a valid title. Backtrack:
      // the definition has no title and ends after the destination.
      title = null;
    } else {
      return { label: norm, dest, title, end: afterTitle };
    }
  }
  // No title (or the title backtracked). The definition ends at the end
  // of the destination's line; anything but spaces/tabs between the
  // destination and the newline makes it invalid.
  let endPos = destEnd;
  while (endPos < n && text[endPos] !== '\n') {
    if (text[endPos] !== ' ' && text[endPos] !== '\t') return null;
    endPos++;
  }
  return { label: norm, dest, title, end: endPos };
}

// Position just past the leading link reference definitions in `text`
// (skipping whitespace/newlines between them). Used to decide whether
// a paragraph is only definitions (cm-216) and by collectRefs.
function leadingDefsEnd(text) {
  let pos = 0;
  const n = text.length;
  for (;;) {
    let p = pos;
    while (p < n && (text[p] === ' ' || text[p] === '\t' || text[p] === '\n')) p++;
    if (p >= n) return p;
    if (text[p] !== '[') return pos;
    let lineStart = p;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
    if (indentCols(text, lineStart, p) > 3) return pos;
    const def = parseLinkDef(text, p);
    if (!def) return pos;
    pos = def.end;
  }
}

// Column width of the whitespace between lineStart and p (tabs expand).
function indentCols(text, lineStart, p) {
  let col = 0;
  for (let k = lineStart; k < p; k++) {
    if (text[k] === '\t') col += 4 - (col % 4);
    else col++;
  }
  return col;
}

// Walk the tree, extract link reference definitions from paragraph and
// setext-heading starts (a heading's text may begin with definitions,
// cm-215). Returns a Map<label, {dest, title}>. Paragraphs/headings
// that become empty are marked gone.
function collectRefs(root) {
  const refs = new Map();
  const processText = (node) => {
    const text = node.text;
    let pos = 0;
    let anyDef = false;
    for (;;) {
      let p = pos;
      while (p < text.length &&
        (text[p] === ' ' || text[p] === '\t' || text[p] === '\n')) p++;
      if (p >= text.length) { pos = p; break; }
      if (text[p] !== '[') break;
      let lineStart = p;
      while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
      if (indentCols(text, lineStart, p) > 3) break;
      const def = parseLinkDef(text, p);
      if (!def) break;
      if (!refs.has(def.label)) refs.set(def.label, { dest: def.dest, title: def.title });
      pos = def.end;
      anyDef = true;
    }
    if (anyDef) {
      const rest = text.slice(pos).replace(/^[ \t\n]+/, '');
      node.text = rest;
      if (rest === '') node.gone = true;
    }
  };
  const walk = (node) => {
    if (node.t === 'para' || node.t === 'heading') processText(node);
    if (node.children) {
      for (const ch of node.children) walk(ch);
    }
  };
  walk(root);
  return refs;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderBlocks(node, refs, out, tightParent) {
  switch (node.t) {
    case 'doc':
      for (const ch of node.children) renderBlocks(ch, refs, out, false);
      break;
    case 'para': {
      if (node.gone) break;
      out.push('<p>');
      parseInline(node.text, refs, out);
      out.push('</p>\n');
      break;
    }
    case 'heading': {
      if (node.gone) break;
      out.push('<h' + node.level + '>');
      parseInline(node.text, refs, out);
      out.push('</h' + node.level + '>\n');
      break;
    }
    case 'code': {
      out.push('<pre><code');
      if (node.fenced && node.lang) {
        out.push(' class="language-');
        escNoDec(node.lang, 0, node.lang.length, out);
        out.push('"');
      }
      out.push('>');
      escCode(node.text, 0, node.text.length, out);
      out.push('</code></pre>\n');
      break;
    }
    case 'html': {
      let text = node.text;
      if (node.endedByBlank && text.endsWith('\n')) text = text.slice(0, -1);
      out.push(text);
      break;
    }
    case 'hr':
      out.push('<hr>\n');
      break;
    case 'quote':
      out.push('<blockquote>\n');
      for (const ch of node.children) renderBlocks(ch, refs, out, false);
      out.push('</blockquote>\n');
      break;
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      out.push('<' + tag);
      if (node.ordered && node.start !== 1) out.push(' start="' + node.start + '"');
      out.push('>\n');
      for (const item of node.children) renderBlocks(item, refs, out, node.tight);
      out.push('</' + tag + '>\n');
      break;
    }
    case 'item': {
      out.push('<li>');
      const kids = node.children;
      let taskHtml = null;
      let taskRest = null;
      if (kids.length > 0 && kids[0].t === 'para' && !kids[0].gone) {
        const t0 = kids[0].text;
        if (t0.length >= 3 && t0[0] === '[' &&
          (t0[1] === ' ' || t0[1] === 'x' || t0[1] === 'X') && t0[2] === ']') {
          const nx = t0[3];
          if (nx === undefined || nx === ' ' || nx === '\t') {
            taskHtml = t0[1] === ' '
              ? '<input disabled="" type="checkbox">'
              : '<input checked="" disabled="" type="checkbox">';
            taskRest = t0.slice(3);
          }
        }
      }
      for (let k = 0; k < kids.length; k++) {
        const ch = kids[k];
        if (ch.t === 'para' && !ch.gone) {
          if (tightParent) {
            if (k === 0 && taskHtml !== null) {
              out.push(taskHtml);
              parseInline(taskRest, refs, out);
            } else {
              parseInline(ch.text, refs, out);
            }
          } else {
            out.push('<p>');
            if (k === 0 && taskHtml !== null) {
              out.push(taskHtml);
              parseInline(taskRest, refs, out);
            } else {
              parseInline(ch.text, refs, out);
            }
            out.push('</p>\n');
          }
        } else {
          renderBlocks(ch, refs, out, false);
        }
      }
      out.push('</li>\n');
      break;
    }
    case 'table': {
      out.push('<table>\n<thead>\n<tr>\n');
      for (let k = 0; k < node.header.length; k++) {
        const a = node.aligns[k];
        out.push('<th' + (a ? ' align="' + a + '"' : '') + '>');
        parseInline(node.header[k], refs, out);
        out.push('</th>\n');
      }
      out.push('</tr>\n</thead>\n');
      if (node.rows.length > 0) {
        out.push('<tbody>');
        for (const row of node.rows) {
          out.push('<tr>\n');
          for (let k = 0; k < node.header.length; k++) {
            const a = node.aligns[k];
            const cell = k < row.length ? row[k] : '';
            out.push('<td' + (a ? ' align="' + a + '"' : '') + '>');
            parseInline(cell, refs, out);
            out.push('</td>\n');
          }
          out.push('</tr>\n');
        }
        out.push('</tbody></table>\n');
      } else {
        out.push('</table>\n');
      }
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parse(markdown) {
  const src = markdown.replace(/\r\n?/g, '\n');
  const bp = new BP(splitLines(src));
  const root = bp.run();
  const refs = collectRefs(root);
  const out = [];
  renderBlocks(root, refs, out, false);
  return out.join('');
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------
// Linked-list inline nodes. Kinds:
//   text  {s, a, b}    raw slice of the paragraph source
//   code  {s, a, b}    code-span content slice (raw, newlines kept)
//   br                 hard break  -> "<br />\n"
//   html  {s, a, b}    raw inline HTML tag slice
//   delim {ch, len}    emphasis / strikethrough / link-opener run; the
//                      matching delimiter entry lives on node.delim
//   link  {href, title, isImage, isAutolink, s, a, b}  children = link text
//   em | strong | del  wrappers with children
function inode(t) {
  return { t, next: null, prev: null, parent: null, firstChild: null, lastChild: null };
}
function iAppend(parent, child) {
  child.parent = parent;
  if (parent.lastChild) { parent.lastChild.next = child; child.prev = parent.lastChild; parent.lastChild = child; }
  else parent.firstChild = parent.lastChild = child;
}
function iUnlink(node) {
  if (node.prev) node.prev.next = node.next; else if (node.parent) node.parent.firstChild = node.next;
  if (node.next) node.next.prev = node.prev; else if (node.parent) node.parent.lastChild = node.prev;
  node.prev = node.next = node.parent = null;
}
function iReplace(oldNode, newNode) {
  newNode.parent = oldNode.parent;
  newNode.prev = oldNode.prev;
  newNode.next = oldNode.next;
  if (oldNode.prev) oldNode.prev.next = newNode; else if (oldNode.parent) oldNode.parent.firstChild = newNode;
  if (oldNode.next) oldNode.next.prev = newNode; else if (oldNode.parent) oldNode.parent.lastChild = newNode;
  oldNode.prev = oldNode.next = oldNode.parent = null;
}

// ---------------------------------------------------------------------------
// Extended autolinks (GFM): www., scheme://, email.
// ---------------------------------------------------------------------------
function isSchemeCode(c) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||
    c === 43 || c === 45 || c === 46; // + - .
}
function isLocalFirstCode(c) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||
    c === 33 || c === 35 || c === 36 || c === 37 || c === 38 || c === 39 ||
    c === 42 || c === 43 || c === 45 || c === 47 || c === 61 || c === 63 ||
    c === 94 || c === 95 || c === 96 || c === 123 || c === 124 || c === 125 || c === 126;
  // alnum + ! # $ % & ' * + - / = ? ^ _ ` { | } ~   (no '.')
}
function isLocalAnyCode(c) {
  return isLocalFirstCode(c) || c === 46; // + '.'
}

// Strip trailing junk from an autolink URL [start, end): a trailing
// "&name;" entity, ")" while parens are unbalanced, and trailing
// punctuation ? ! . , : ; * _ ~. Loops until nothing more strips.
function stripAutolinkTrailing(s, start, end) {
  let e = end;
  for (;;) {
    if (e <= start) return e;
    const last = s[e - 1];
    if (last === ';') {
      let k = e - 2;
      while (k >= start && isWordCode(s.charCodeAt(k))) k--;
      if (k >= start && s.charCodeAt(k) === 38 && k + 1 < e - 1) { e = k; continue; }
    }
    if (last === ')') {
      let open = 0, close = 0;
      for (let k = start; k < e; k++) {
        if (s[k] === '(') open++;
        else if (s[k] === ')') close++;
      }
      if (close > open) { e--; continue; }
    }
    if (last === '?' || last === '!' || last === '.' || last === ',' ||
        last === ':' || last === ';' || last === '*' || last === '_' || last === '~') {
      e--; continue;
    }
    return e;
  }
}

// www. autolink starting at i (s[i..] begins with "www.").
// Domain: labels of alnum (with '-' inside, never at the ends), at least
// two labels (one dot). Optional :port (digits) and /path.
function parseWwwAutolink(s, i, n) {
  let j = i + 4;
  let labels = 0;
  for (;;) {
    if (j >= n || !isAlphaNumCode(s.charCodeAt(j))) return null;
    let k = j;
    while (k < n && (isAlphaNumCode(s.charCodeAt(k)) || s.charCodeAt(k) === 45)) k++;
    if (s.charCodeAt(k - 1) === 45) return null;
    labels++;
    j = k;
    if (j < n && s.charCodeAt(j) === 46 && j + 1 < n && isAlphaNumCode(s.charCodeAt(j + 1))) { j++; continue; }
    break;
  }
  if (labels < 2) return null;
  if (j < n && s.charCodeAt(j) === 58 && j + 1 < n && isDigitCode(s.charCodeAt(j + 1))) {
    j++;
    while (j < n && isDigitCode(s.charCodeAt(j))) j++;
  }
  // A backslash directly after the domain (no "/") is part of the URL
  // (doc-40: "www.flux.com\" links with href "...%5C"); without it the
  // "\" plus newline would wrongly become a hard break.
  if (j < n && s.charCodeAt(j) === 92) j++;
  if (j < n && s.charCodeAt(j) === 47) {
    while (j < n) {
      const c = s.charCodeAt(j);
      // Stop at ']' so a bare URL inside link text cannot swallow the
      // link-text terminator and its destination (doc-12/16/19/24:
      // "[module match https://...](#a-is-method)" is one link, not an
      // autolink ending at "(#a-is-method").
      if (c === 32 || c === 9 || c === 10 || c === 60 || c === 93) break;
      j++;
    }
  }
  const end = stripAutolinkTrailing(s, i, j);
  return end > i ? end : null;
}

// Scheme autolink starting at i: scheme (2-32 chars) + "://" + the
// longest run of non-whitespace, non-'<' characters.
function parseSchemeAutolink(s, i, n) {
  let j = i;
  while (j < n && isSchemeCode(s.charCodeAt(j))) j++;
  const schemeLen = j - i;
  if (schemeLen < 2 || schemeLen > 32) return null;
  if (s.charCodeAt(j) !== 58 || s.charCodeAt(j + 1) !== 47 || s.charCodeAt(j + 2) !== 47) return null;
  j += 3;
  if (j >= n) return null;
  let k = j;
  while (k < n) {
    const c = s.charCodeAt(k);
    // Stop at ']' so a bare URL inside link text cannot swallow the
    // link-text terminator and its destination (doc-12/16/19/24).
    if (c === 32 || c === 9 || c === 10 || c === 60 || c === 93) break;
    k++;
  }
  if (k === j) return null;
  const end = stripAutolinkTrailing(s, i, k);
  return end > i ? end : null;
}

// Validate an email address string (local@domain). Local part: starts and
// ends with a non-dot local char, no "..". Domain: labels of alnum (with
// '-' inside), at least one dot.
function isEmailStr(s) {
  const at = s.indexOf('@');
  if (at < 1) return false;
  const local = s.slice(0, at);
  if (local.charCodeAt(0) === 46 || local.charCodeAt(local.length - 1) === 46) return false;
  if (local.indexOf('..') !== -1) return false;
  for (let k = 0; k < local.length; k++) if (!isLocalAnyCode(s.charCodeAt(k))) return false;
  const dom = s.slice(at + 1);
  const labels = dom.split('.');
  if (labels.length < 2) return false;
  for (const lab of labels) {
    if (lab.length < 1 || lab.length > 63) return false;
    if (!isAlphaNumCode(lab.charCodeAt(0)) || !isAlphaNumCode(lab.charCodeAt(lab.length - 1))) return false;
    for (let k = 0; k < lab.length; k++) {
      const c = lab.charCodeAt(k);
      if (!isAlphaNumCode(c) && c !== 45) return false;
    }
  }
  return true;
}

// Precompute extended-autolink candidate starts over the whole text.
// wwwStarts / schemeStarts: Sets of start indexes. emailStarts: Map of
// start index -> match end index.
function precomputeAutolinks(s, n) {
  const wwwStarts = new Set();
  const schemeStarts = new Set();
  const emailStarts = new Map();
  let m;
  const wwwRe = /www\./g;
  while ((m = wwwRe.exec(s)) !== null) {
    const st = m.index;
    if (st === 0 || !isAlphaNumCode(s.charCodeAt(st - 1))) wwwStarts.add(st);
  }
  const schemeRe = /[a-zA-Z][a-zA-Z0-9+.-]{1,31}:\/\//g;
  while ((m = schemeRe.exec(s)) !== null) {
    const st = m.index;
    // the char before must not be a scheme char (else this is the middle
    // of a longer-than-32 scheme, which is not an autolink at all)
    if (st === 0 || !isSchemeCode(s.charCodeAt(st - 1))) schemeStarts.add(st);
  }
  // Local part: first char is a non-dot local char that is not an inline
  // syntax char (` * _ ~ !), so an emphasis delimiter before an email is
  // not swallowed; last char is any non-dot local char.
  const emailRe = /[a-zA-Z0-9#$%&'+-\/=?^{|}](?:[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]*[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
  while ((m = emailRe.exec(s)) !== null) {
    const st = m.index, e = st + m[0].length;
    // the char after must not be a word char or '-'; but a '_' that is
    // the first of a "__" run is a strong closer, not part of a word
    // (doc-04/25: "__...because@mark.example.com__" linkifies, while
    // gfm-632's single trailing "_" in "a.b-c_d@a.b_" does not).
    if (e < n) {
      const c = s.charCodeAt(e);
      if ((isWordCode(c) || c === 45) && !(c === 95 && e + 1 < n && s.charCodeAt(e + 1) === 95)) continue;
    }
    const at = m[0].indexOf('@');
    const local = m[0].slice(0, at);
    if (local.indexOf('..') !== -1) continue;
    // If the email is preceded by "scheme:", the link starts at the
    // scheme (gfm-633/634/635: mailto:foo@bar.baz, xmpp:foo@bar.baz/txt
    // are single links; the "mailto:" is not separate text).
    let linkStart = st;
    if (st >= 3 && s[st - 1] === ':') {
      let k = st - 2;
      while (k >= 0 && isSchemeCode(s.charCodeAt(k))) k--;
      const schStart = k + 1;
      const schLen = (st - 1) - schStart;
      if (schLen >= 2 && schLen <= 32 && isAsciiLetter(s.charCodeAt(schStart)) &&
          (schStart === 0 || !isSchemeCode(s.charCodeAt(schStart - 1)))) {
        linkStart = schStart;
      }
    }
    let end = e;
    if (linkStart !== st) {
      // Optional single "/segment" after the email (xmpp:foo@bar.baz/txt;
      // "/txt/bin" ends at "/txt", and a trailing "/" is excluded).
      if (end < n && s[end] === '/') {
        let k = end + 1;
        while (k < n) {
          const c = s.charCodeAt(k);
          if (c === 32 || c === 9 || c === 10 || c === 60 || c === 47) break;
          k++;
        }
        if (k > end + 1) end = k;
      }
      end = stripAutolinkTrailing(s, linkStart, end);
    }
    emailStarts.set(linkStart, end);
  }
  return { wwwStarts, schemeStarts, emailStarts };
}

// ---------------------------------------------------------------------------
// Link parsing (inline links and reference links)
// ---------------------------------------------------------------------------
// Skip spaces/tabs/newlines; fail (-1) if a blank line is crossed.
function skipInlineWS(s, p, n) {
  let i = p, seenNL = false;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9) { i++; continue; }
    if (c === 10) { if (seenNL) return -1; seenNL = true; i++; continue; }
    break;
  }
  return i;
}

// Bare destination: non-space run with balanced parens; a backslash
// before ASCII punctuation escapes it (skipped as a unit).
function parseBareDest(s, p, n) {
  let depth = 0, j = p;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c === 32 || c === 9 || c === 10 || c < 32) break;
    if (c === 92 && j + 1 < n && isAsciiPunctCode(s.charCodeAt(j + 1))) { j += 2; continue; }
    if (c === 40) { depth++; j++; continue; }
    if (c === 41) { if (depth === 0) break; depth--; j++; continue; }
    j++;
  }
  if (j === p) return null;
  return { dest: s.slice(p, j), end: j };
}

// Link title: "..." or '...' or (...) with backslash escapes.
// Newlines are allowed inside a title.
function parseLinkTitle(s, p, n) {
  const q = s[p];
  if (q === '"' || q === "'") {
    let j = p + 1;
    while (j < n) {
      if (s[j] === '\\' && j + 1 < n && isAsciiPunctCode(s.charCodeAt(j + 1))) { j += 2; continue; }
      if (s[j] === q) return { title: s.slice(p + 1, j), end: j + 1 };
      j++;
    }
    return null;
  }
  if (q === '(') {
    let depth = 1, j = p + 1;
    while (j < n) {
      if (s[j] === '\\' && j + 1 < n && isAsciiPunctCode(s.charCodeAt(j + 1))) { j += 2; continue; }
      if (s[j] === '(') { depth++; j++; continue; }
      if (s[j] === ')') {
        depth--;
        if (depth === 0) return { title: s.slice(p + 1, j), end: j + 1 };
        j++; continue;
      }
      j++;
    }
    return null;
  }
  return null;
}

// Inline link: s[p] === '(' ; returns {dest, title, end} or null.
function parseInlineLink(s, p, n) {
  let q = skipInlineWS(s, p + 1, n);
  if (q === -1) return null;
  let dest, end;
  // An empty destination "()" is a valid link with href="".
  if (s[q] === ')') return { dest: '', title: null, end: q + 1 };
  if (s[q] === '<') {
    let j = q + 1, found = -1;
    while (j < n) {
      if (s[j] === '\\' && j + 1 < n && isAsciiPunctCode(s.charCodeAt(j + 1))) { j += 2; continue; }
      if (s[j] === '>') { found = j; break; }
      if (s[j] === '\n' || s[j] === '<') break;
      j++;
    }
    if (found === -1) return null;
    dest = s.slice(q + 1, found);
    end = found + 1;
  } else {
    const r = parseBareDest(s, q, n);
    if (!r) return null;
    dest = r.dest;
    end = r.end;
  }
  let title = null;
  let q2 = skipInlineWS(s, end, n);
  if (q2 === -1) return null;
  if (s[q2] === '"' || s[q2] === "'" || s[q2] === '(') {
    const t = parseLinkTitle(s, q2, n);
    if (!t) return null;
    title = t.title;
    end = t.end;
    q2 = skipInlineWS(s, end, n);
    if (q2 === -1) return null;
  }
  if (s[q2] !== ')') return null;
  return { dest, title, end: q2 + 1 };
}

// Plain text of one inline node (for link labels and image alt text).
function plainTextNode(node, out) {
  switch (node.t) {
    case 'text': case 'code': case 'html':
      out.push(node.s.slice(node.a, node.b));
      break;
    case 'lit':
      out.push(node.ch);
      break;
    case 'delim': {
      const ch = node.ch;
      if (ch === '[') out.push('[');
      else if (ch === '![') out.push('![');
      else for (let k = 0; k < node.len; k++) out.push(ch);
      break;
    }
    case 'br':
      out.push('\n');
      break;
    case 'link':
      if (node.isAutolink) { out.push(node.s.slice(node.a, node.b)); break; }
      for (let c = node.firstChild; c; c = c.next) plainTextNode(c, out);
      break;
    case 'em': case 'strong': case 'del':
      for (let c = node.firstChild; c; c = c.next) plainTextNode(c, out);
      break;
    default:
      break;
  }
}
function plainTextRange(first, last) {
  if (!first) return '';
  const out = [];
  for (let c = first; c; c = c.next) {
    plainTextNode(c, out);
    if (c === last) break;
  }
  return out.join('');
}

// Plain text for a link LABEL: same as plainTextNode, except a
// backslash-escaped char contributes its RAW source ("\\!"), because a
// label is matched against the raw reference label (cm-545).
function labelTextNode(node, out) {
  if (node.t === 'lit') { out.push(node.s.slice(node.a, node.b)); return; }
  plainTextNode(node, out);
}
function labelTextRange(first, last) {
  if (!first) return '';
  const out = [];
  for (let c = first; c; c = c.next) {
    labelTextNode(c, out);
    if (c === last) break;
  }
  return out.join('');
}

// Form the link node from an opener entry: move the siblings after the
// opener into the link and scope their delimiter entries to the link.
// Angle-bracket autolinks (<...>) inside link text are KEPT as nested
// <a> (doc-04); bare autolinks (www/scheme/email) inside link text are
// flattened back to plain text (doc-01/10/16: the URL is link text).
function formLink(opener, root, dest, title) {
  const link = inode('link');
  link.href = dest;
  link.title = title;
  link.isImage = opener.ch === '![';
  link.isAutolink = false;
  let child = opener.node.next;
  while (child) {
    const next = child.next;
    if (child.t === 'link' && child.isAutolink && !child.isAngle) {
      const tn = inode('text');
      tn.s = child.s; tn.a = child.a; tn.b = child.b;
      iUnlink(child);
      iAppend(link, tn);
    } else {
      iUnlink(child);
      iAppend(link, child);
      if (child.t === 'delim' && child.delim) child.delim.scope = link;
    }
    child = next;
  }
  iReplace(opener.node, link);
  opener.removed = true;
  return link;
}

// Bracket balance of a link text (raw source s[start..end)): '[' adds
// one, ']' subtracts one; backslash escapes and code spans are skipped.
// The balance must stay >= 0 and end at 0 — the closer must be the
// opener's matching ']'. (cm-520.)
function linkTextBalanced(s, start, end) {
  let depth = 0, i = start;
  while (i < end) {
    const c = s[i];
    if (c === '\\' && i + 1 < end) { i += 2; continue; }
    if (c === '`') {
      let j = i;
      while (j < end && s[j] === '`') j++;
      const runLen = j - i;
      let k = j, found = -1;
      while (k < end) {
        if (s[k] === '`') {
          let m = k;
          while (m < end && s[m] === '`') m++;
          if (m - k === runLen) { found = k; break; }
          k = m;
        } else k++;
      }
      if (found === -1) { i = j; continue; }
      i = found + runLen;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth < 0) return false;
    }
    i++;
  }
  return depth === 0;
}

// Try to form a link whose opener is `opener` ('[' or '![' entry) and
// whose closer ']' is at source position closerPos. Returns the source
// position just past the link, or null if no link forms.
// Fallback order (spec): inline link, then full reference link, then
// collapsed "[]", then shortcut. Two subtleties:
// - A failed inline link "(not a link)" falls back to the shortcut
//   (cm-568), but a syntactically valid full-ref label whose reference
//   is not defined does NOT fall back (cm-571: "[foo][bar][baz]" leaves
//   "[foo]" literal).
// (The matching-']' bracket-balance check lives in the ']' case, which
// must not deactivate the opener when it fails — cm-520.)
function tryLink(opener, closerPos, s, n, refs, root) {
  const first = opener.node.next;
  const last = root.lastChild;
  const p = closerPos + 1;
  let dest = null, title = null, end = -1;
  // 1. Inline link.
  if (s[p] === '(') {
    const r = parseInlineLink(s, p, n);
    if (r) {
      dest = unescapeBackslashes(r.dest);
      title = r.title === null ? null : unescapeBackslashes(r.title);
      end = r.end;
    }
  }
  // 2. Full reference link.
  if (end === -1 && s[p] === '[' && s[p + 1] !== ']') {
    let j = p + 1, lab = '', labEnd = -1, badLabel = false;
    while (j < n) {
      if (s[j] === '\\' && j + 1 < n && isAsciiPunctCode(s.charCodeAt(j + 1))) {
        lab += s[j];
        lab += s[j + 1];
        j += 2;
        continue;
      }
      if (s[j] === '[') { badLabel = true; break; }
      if (s[j] === ']') { labEnd = j; break; }
      lab += s[j];
      j++;
    }
    if (labEnd !== -1) {
      const label = normalizeLabel(lab);
      if (label) {
        const ref = refs.get(label);
        if (ref) { dest = ref.dest; title = ref.title; end = labEnd + 1; }
        else return null; // valid label, no reference: no fallback
      }
      // Empty label: fall through (not a valid full-ref label).
    }
    // Unclosed label or '[' inside: fall through to collapsed/shortcut.
  }
  // 3. Collapsed "[]" reference link.
  if (end === -1 && s[p] === '[' && s[p + 1] === ']') {
    const label = normalizeLabel(labelTextRange(first, last));
    if (label) {
      const ref = refs.get(label);
      if (ref) { dest = ref.dest; title = ref.title; end = p + 2; }
    }
  }
  // 4. Shortcut reference link.
  if (end === -1) {
    const label = normalizeLabel(labelTextRange(first, last));
    if (label) {
      const ref = refs.get(label);
      if (ref) { dest = ref.dest; title = ref.title; end = p; }
    }
  }
  if (end === -1) return null;
  formLink(opener, root, dest, title);
  return end;
}

// ---------------------------------------------------------------------------
// The inline scanner: one pass building a linked list of inline nodes plus
// a delimiter stack; emphasis is resolved afterwards (processEmphasis).
// ---------------------------------------------------------------------------
function parseInline(text, refs, out) {
  // Fast path: no inline syntax at all (no code/emphasis/link/escape/
  // autolink triggers, no hard break). Plain text just needs escaping.
  if (!/[`_*\\[~]/.test(text) && text.indexOf('![') === -1 &&
      !/<[a-zA-Z\/?!]/.test(text) && text.indexOf('www.') === -1 &&
      text.indexOf('://') === -1 && text.indexOf('@') === -1 &&
      !/ {2,}\n/.test(text) && text.indexOf('\\\n') === -1) {
    escText(text, 0, text.length, out);
    return;
  }
  const n = text.length;
  const cands = precomputeAutolinks(text, n);
  const wwwStarts = cands.wwwStarts, schemeStarts = cands.schemeStarts, emailStarts = cands.emailStarts;
  const root = inode('root');
  const delims = [];
  let i = 0;
  function addText(a, b) {
    if (a >= b) return;
    const last = root.lastChild;
    if (last && last.t === 'text' && last.b === a) { last.b = b; return; }
    const node = inode('text');
    node.s = text; node.a = a; node.b = b;
    iAppend(root, node);
  }
  function addDelim(ch, len, canOpen, canClose) {
    const node = inode('delim');
    node.ch = ch; node.len = len;
    iAppend(root, node);
    const entry = { node, ch, canOpen, canClose, active: true, removed: false, scope: null, pos: i };
    node.delim = entry;
    delims.push(entry);
    return entry;
  }
  function addAutolink(href, a, b, isAngle) {
    const node = inode('link');
    node.href = href;
    node.title = null;
    node.isImage = false;
    node.isAutolink = true;
    node.isAngle = !!isAngle;
    node.s = text; node.a = a; node.b = b;
    iAppend(root, node);
  }

  while (i < n) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    // Extended autolinks (start with a letter or digit).
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      if (wwwStarts.has(i)) {
        const end = parseWwwAutolink(text, i, n);
        if (end !== null) { addAutolink('http://' + text.slice(i, end), i, end); i = end; continue; }
      }
      if (schemeStarts.has(i)) {
        const end = parseSchemeAutolink(text, i, n);
        if (end !== null) { addAutolink(text.slice(i, end), i, end); i = end; continue; }
      }
      if (emailStarts.has(i)) {
        const end = emailStarts.get(i);
        const disp = text.slice(i, end);
        // If the link already carries a scheme (mailto:/xmpp: + email),
        // the href is the text itself; a bare email gets "mailto:"
        // prepended. A ':' before the '@' is the scheme's (the email
        // local part never contains ':').
        const at = disp.indexOf('@');
        const href = (at > 0 && disp.indexOf(':') !== -1 && disp.indexOf(':') < at)
          ? disp : 'mailto:' + disp;
        addAutolink(href, i, end);
        i = end;
        continue;
      }
    }
    if (ch === '`') {
      // Code span: a closing run of exactly the opener's length.
      let j = i;
      while (j < n && text[j] === '`') j++;
      const runLen = j - i;
      let k = j, found = -1;
      while (k < n) {
        if (text[k] === '`') {
          let m = k;
          while (m < n && text[m] === '`') m++;
          if (m - k === runLen) { found = k; break; }
          k = m;
        } else k++;
      }
      if (found === -1) {
        addText(i, j);
        i = j;
      } else {
        const node = inode('code');
        node.s = text; node.a = j; node.b = found;
        iAppend(root, node);
        i = found + runLen;
      }
      continue;
    }
    if (ch === '\\') {
      if (i + 1 < n) {
        const nc = text[i + 1];
        if (nc === '\n') {
          const node = inode('br');
          iAppend(root, node);
          i += 2;
          // After a hard break, the next line's leading spaces/tabs
          // are stripped (cm-637).
          while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
        } else if (isAsciiPunctCode(nc.charCodeAt(0))) {
          // Backslash-escaped punctuation: a literal char. It must NOT
          // be treated as a delimiter, and an escaped & " ' < > must be
          // HTML-escaped (not left as an entity reference), so it gets
          // its own node kind. Keep the raw slice too: a link label is
          // the RAW text ("foo\\!" does not match ref "foo!", cm-545).
          const node = inode('lit');
          node.ch = nc;
          node.s = text; node.a = i; node.b = i + 2;
          iAppend(root, node);
          i += 2;
        } else {
          addText(i, i + 1);
          i++;
        }
      } else {
        addText(i, i + 1);
        i++;
      }
      continue;
    }
    if (ch === '*' || ch === '_' || ch === '~') {
      let j = i;
      while (j < n && text[j] === ch) j++;
      const runLen = j - i;
      if (ch === '~' && runLen > 2) {
        // Runs of 3+ tildes are literal text.
        addText(i, j);
        i = j;
        continue;
      }
      const prev = i > 0 ? text[i - 1] : undefined;
      const next = j < n ? text[j] : undefined;
      const prevWS = prev === undefined || isSpaceCh(prev);
      const nextWS = next === undefined || isSpaceCh(next);
      const prevPunct = prev !== undefined && isPunctCh(prev);
      const nextPunct = next !== undefined && isPunctCh(next);
      const leftFlank = !nextWS && (!nextPunct || prevWS || prevPunct);
      const rightFlank = !prevWS && (!prevPunct || nextWS || nextPunct);
      let canOpen, canClose;
      if (ch === '_') {
        canOpen = leftFlank && (!rightFlank || prevPunct);
        canClose = rightFlank && (!leftFlank || nextPunct);
      } else {
        canOpen = leftFlank;
        canClose = rightFlank;
      }
      addDelim(ch, runLen, canOpen, canClose);
      i = j;
      continue;
    }
    if (ch === '[') {
      addDelim('[', 1, true, false);
      i++;
      continue;
    }
    if (ch === ']') {
      let opener = null;
      for (let k = delims.length - 1; k >= 0; k--) {
        const d = delims[k];
        if (d.removed || !d.active) continue;
        if (d.ch === '[' || d.ch === '![') { opener = d; break; }
      }
      if (!opener) {
        addText(i, i + 1);
        i++;
        continue;
      }
      // The closer must be the opener's matching ']' (balanced brackets
      // in the link text). If not, this ']' is literal text and the
      // opener stays active for its real matching ']' (cm-520:
      // "![[[foo](uri1)](uri2)](uri3)" — the second ']' is not the
      // image's matching ']', the third is). Do NOT deactivate here.
      const textStart = opener.pos + (opener.ch === '![' ? 2 : 1);
      if (!linkTextBalanced(text, textStart, i)) {
        addText(i, i + 1);
        i++;
        continue;
      }
      const end = tryLink(opener, i, text, n, refs, root);
      if (end !== null) {
        // Deactivate link openers that precede this one — but only when
        // a LINK formed, and only '[' openers. An image does not block
        // an outer link ("[![moon](moon.jpg)](/uri)"), and a '![' opener
        // is never a link opener ("![[[foo](uri1)](uri2)](uri3)").
        if (opener.ch === '[') {
          for (let k = 0; k < delims.length; k++) {
            const d = delims[k];
            if (d === opener) break;
            if (d.ch === '[') d.active = false;
          }
        }
        i = end;
      } else {
        opener.active = false;
        addText(i, i + 1);
        i++;
      }
      continue;
    }
    if (ch === '!') {
      if (i + 1 < n && text[i + 1] === '[') {
        addDelim('![', 1, true, false);
        i += 2;
      } else {
        addText(i, i + 1);
        i++;
      }
      continue;
    }
    if (ch === '<') {
      // 1. Autolink <scheme:...> or <email>.
      let j = i + 1;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === 62 || c === 32 || c === 9 || c === 10 || c === 60) break;
        j++;
      }
      if (j < n && text.charCodeAt(j) === 62) {
        const content = text.slice(i + 1, j);
        const colon = content.indexOf(':');
        let linked = false;
        if (colon >= 2 && colon <= 32) {
          let valid = true;
          const c0 = content.charCodeAt(0);
          if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122))) valid = false;
          for (let k = 1; k < colon && valid; k++) {
            if (!isSchemeCode(content.charCodeAt(k))) valid = false;
          }
          if (valid && colon + 1 < content.length) {
            addAutolink(content, i + 1, j, true);
            i = j + 1;
            linked = true;
          }
        }
        if (!linked && content.indexOf('@') !== -1 && isEmailStr(content)) {
          addAutolink('mailto:' + content, i + 1, j, true);
          i = j + 1;
          linked = true;
        }
        if (linked) continue;
      }
      // 2. Inline HTML tag.
      const tagEnd = scanTag(text, i, n);
      if (tagEnd !== -1) {
        const node = inode('html');
        node.s = text; node.a = i; node.b = tagEnd;
        iAppend(root, node);
        i = tagEnd;
        continue;
      }
      // 3. Literal '<'.
      addText(i, i + 1);
      i++;
      continue;
    }
    if (ch === '\n') {
      // Hard break: 2+ spaces immediately before the newline.
      let k = i - 1, spaces = 0;
      while (k >= 0 && text[k] === ' ') { spaces++; k--; }
      if (spaces >= 2) {
        const last = root.lastChild;
        if (last && last.t === 'text' && last.b === i) {
          last.b -= spaces;
          if (last.a === last.b) iUnlink(last);
        }
        const node = inode('br');
        iAppend(root, node);
        i++;
        // After a hard break, the next line's leading spaces/tabs are
        // stripped (cm-636/637: "foo  \n     bar" -> "foo<br>bar").
        while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
      } else {
        addText(i, i + 1);
        i++;
      }
      continue;
    }
    // Plain text run.
    let j = i + 1;
    while (j < n) {
      const c2 = text[j];
      if (c2 === '`' || c2 === '*' || c2 === '_' || c2 === '[' || c2 === ']' ||
          c2 === '!' || c2 === '<' || c2 === '\\' || c2 === '~' || c2 === '\n') break;
      const c2c = text.charCodeAt(j);
      if (((c2c >= 48 && c2c <= 57) || (c2c >= 65 && c2c <= 90) || (c2c >= 97 && c2c <= 122)) &&
          (wwwStarts.has(j) || schemeStarts.has(j) || emailStarts.has(j))) break;
      j++;
    }
    addText(i, j);
    i = j;
  }
  processEmphasis(delims);
  renderInline(root, out);
}

// ---------------------------------------------------------------------------
// Emphasis processing (CommonMark appendix A) over the delimiter stack.
// A delimiter inside a link's text can only match delimiters inside that
// same link (scope), so an emphasis delimiter inside a link never pairs
// with one outside it (cm-473 / cm-521).
// ---------------------------------------------------------------------------
function makeEmphasis(opener, closer, use, kind) {
  const wrap = inode(kind);
  // S = the sibling of the opener node that is the closer node itself or
  // contains it (a link node wrapping the closer).
  let S = closer.node;
  while (S && S.parent !== opener.node.parent) S = S.parent;
  if (!S) return false;
  // Move the siblings between the opener and S into the wrapper.
  let child = opener.node.next;
  while (child && child !== S) {
    const next = child.next;
    iUnlink(child);
    iAppend(wrap, child);
    child = next;
  }
  // If S is a link node containing the closer, move it into the wrapper.
  // If S is the closer node itself, it stays after the wrapper (or is
  // removed below if fully used).
  if (S !== closer.node) {
    iUnlink(S);
    iAppend(wrap, S);
  }
  opener.node.len -= use;
  closer.node.len -= use;
  if (opener.node.len === 0) {
    iReplace(opener.node, wrap);
    opener.removed = true;
  } else {
    // Leftover opener delimiter stays before the wrapper.
    wrap.parent = opener.node.parent;
    wrap.prev = opener.node;
    wrap.next = opener.node.next;
    if (opener.node.next) opener.node.next.prev = wrap;
    else if (opener.node.parent) opener.node.parent.lastChild = wrap;
    opener.node.next = wrap;
  }
  if (closer.node.len === 0) {
    iUnlink(closer.node);
    closer.removed = true;
  }
  // A partially used closer stays in place (after the wrapper if it was
  // a sibling, or inside the link node if it was nested there).
  return true;
}

function processEmphasis(delims) {
  // openersBottom, per scope (the link node a delimiter sits in, or null)
  // and per delimiter char: an opener search may not pass it.
  const bottoms = new Map();
  function bottomFor(scope, ch) {
    let b = bottoms.get(scope);
    if (!b) { b = { '*': -1, '_': -1, '~': -1 }; bottoms.set(scope, b); }
    return b[ch];
  }
  function setBottom(scope, ch, idx) {
    let b = bottoms.get(scope);
    if (!b) { b = { '*': -1, '_': -1, '~': -1 }; bottoms.set(scope, b); }
    b[ch] = idx;
  }
  let ci = 0;
  while (ci < delims.length) {
    const closer = delims[ci];
    if (closer.removed || !closer.canClose || closer.ch === '[' || closer.ch === '![') { ci++; continue; }
    // Look back for the nearest potential opener of the same char, in
    // the same scope, that the odd-match rule allows and that can actually
    // be matched (opener and closer share a sibling ancestor — an opener
    // trapped inside an emphasis/link node the closer is not in cannot
    // match it, e.g. cm-470: the * before "baz" sits inside the strong
    // and must be skipped so the final * matches the opening *).
    let oi = ci - 1;
    let found = -1, use = 1;
    const bot = bottomFor(closer.scope, closer.ch);
    while (oi > bot) {
      const opener = delims[oi];
      if (!opener.removed && opener.ch === closer.ch && opener.canOpen && opener.scope === closer.scope) {
        const u = (opener.node.len >= 2 && closer.node.len >= 2) ? 2 : 1;
        if (((opener.canOpen && opener.canClose) || (closer.canOpen && closer.canClose)) &&
            (opener.node.len + closer.node.len) % 3 === 0 &&
            (opener.node.len % 3 !== 0 || closer.node.len % 3 !== 0)) {
          oi--;
          continue;
        }
        // Can the opener and closer be joined? Walk up from the closer
        // to a node whose parent is the opener's parent.
        let S = closer.node;
        while (S && S.parent !== opener.node.parent) S = S.parent;
        if (!S) { oi--; continue; }
        found = oi; use = u;
        break;
      }
      oi--;
    }
    if (found === -1) {
      // A closer that can also open must not set the bottom: it may still
      // serve as an opener for a later closer (e.g. "foo*bar*" — the
      // first * is both opener and closer; setting the bottom here would
      // block the second * from matching it).
      if (!closer.canOpen) setBottom(closer.scope, closer.ch, ci);
      ci++;
      continue;
    }
    const opener = delims[found];
    const kind = closer.ch === '~' ? 'del' : (use === 2 ? 'strong' : 'em');
    const beforeLen = closer.node.len;
    const made = makeEmphasis(opener, closer, use, kind);
    // If the emphasis could not be built (the opener and closer do not
    // share a sibling ancestor), treat the closer as unmatchable so the
    // loop always makes progress. Same bottom rule as above: a closer
    // that can also open stays available as an opener.
    if (!made || closer.node.len === beforeLen) {
      if (!closer.canOpen) setBottom(closer.scope, closer.ch, ci);
      ci++;
      continue;
    }
    // If the closer is fully used, move on; otherwise try to match the
    // leftover closer again (it can pair with an earlier opener).
    if (closer.node.len === 0) ci++;
  }
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------
function renderInline(root, out) {
  for (let node = root.firstChild; node; node = node.next) renderInlineNode(node, out);
}

function renderInlineNode(node, out) {
  switch (node.t) {
    case 'text':
      escText(node.s, node.a, node.b, out);
      break;
    case 'lit': {
      // A backslash-escaped char: literal, HTML-escaped.
      const ch = node.ch;
      if (ch === '&') out.push('&amp;');
      else if (ch === '"') out.push('&quot;');
      else if (ch === "'") out.push('&#39;');
      else if (ch === '<') out.push('&lt;');
      else if (ch === '>') out.push('&gt;');
      else out.push(ch);
      break;
    }
    case 'code': {
      // Content: newlines become spaces; strip one leading and one
      // trailing space if both are present and the content is not all
      // spaces. Newlines count as spaces for the strip check (the
      // newline-to-space conversion conceptually happens first, so
      // "`\nfoo\n`" strips to "foo").
      const s = node.s;
      let a = node.a, b = node.b;
      let allSpace = true;
      for (let k = a; k < b; k++) {
        if (s[k] !== ' ' && s[k] !== '\n') { allSpace = false; break; }
      }
      if (!allSpace && a < b && (s[a] === ' ' || s[a] === '\n') && (s[b - 1] === ' ' || s[b - 1] === '\n')) { a++; b--; }
      out.push('<code>');
      let i = a, j = a;
      while (i < b) {
        const c = s.charCodeAt(i);
        if (c === 10) {
          if (j < i) escCode(s, j, i, out);
          out.push(' ');
          i++; j = i;
        } else if (c === 38 || c === 60 || c === 62 || c === 34 || c === 39) {
          if (j < i) out.push(s.slice(j, i));
          if (c === 38) out.push('&amp;');
          else if (c === 60) out.push('&lt;');
          else if (c === 62) out.push('&gt;');
          else if (c === 34) out.push('&quot;');
          else out.push('&#39;');
          i++; j = i;
        } else i++;
      }
      if (j < b) out.push(s.slice(j, b));
      out.push('</code>');
      break;
    }
    case 'br':
      out.push('<br>');
      break;
    case 'html':
      out.push(node.s.slice(node.a, node.b));
      break;
    case 'delim': {
      // Unused delimiter: literal text.
      const ch = node.ch;
      if (ch === '[') out.push('[');
      else if (ch === '![') out.push('![');
      else for (let k = 0; k < node.len; k++) out.push(ch);
      break;
    }
    case 'em':
      out.push('<em>');
      for (let c = node.firstChild; c; c = c.next) renderInlineNode(c, out);
      out.push('</em>');
      break;
    case 'strong':
      out.push('<strong>');
      for (let c = node.firstChild; c; c = c.next) renderInlineNode(c, out);
      out.push('</strong>');
      break;
    case 'del':
      out.push('<del>');
      for (let c = node.firstChild; c; c = c.next) renderInlineNode(c, out);
      out.push('</del>');
      break;
    case 'link': {
      if (node.isImage) {
        out.push('<img src="');
        const href = cleanUrl(node.href);
        if (href !== null) escNoDec(href, 0, href.length, out);
        out.push('" alt="');
        const altOut = [];
        for (let c = node.firstChild; c; c = c.next) plainTextNode(c, altOut);
        const altStr = altOut.join('');
        escText(altStr, 0, altStr.length, out);
        out.push('"');
        if (node.title !== null && node.title !== undefined) {
          out.push(' title="');
          escNoDec(node.title, 0, node.title.length, out);
          out.push('"');
        }
        out.push('>');
      } else {
        out.push('<a href="');
        const href = cleanUrl(node.href);
        if (href !== null) escNoDec(href, 0, href.length, out);
        out.push('"');
        if (node.title !== null && node.title !== undefined) {
          out.push(' title="');
          escNoDec(node.title, 0, node.title.length, out);
          out.push('"');
        }
        out.push('>');
        if (node.isAutolink) {
          escNoDec(node.s, node.a, node.b, out);
        } else {
          for (let c = node.firstChild; c; c = c.next) renderInlineNode(c, out);
        }
        out.push('</a>');
      }
      break;
    }
    default:
      break;
  }
}
