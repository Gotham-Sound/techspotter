// Screenplay layout DSL over the minimal PDF writer. Emits runs at the
// canonical US screenplay indents (Courier 12, 12 pt leading) so fixtures
// exercise the indent bands the parser depends on.

import { buildPdf } from './pdfgen.js';

export const X = {
  sceneNumLeft: 60,
  margin: 108, // action + slugs (1.5")
  dialogue: 180, // 2.5"
  paren: 216, // 3.0"
  cue: 266, // ~3.7"
  transition: 440,
  sceneNumRight: 552,
  headerTitle: 108,
  headerPage: 540,
};

const TOP = 720;
const LEADING = 12;
const HEADER_Y = 756;

export class Screenplay {
  #pages = [];
  #y = 0;

  page() {
    this.#pages.push([]);
    this.#y = TOP;
    return this;
  }

  #lastY = 0;

  #emit(x, text, italic = false) {
    if (this.#y < 72) throw new Error('fixture page overflow: call .page()');
    this.#pages.at(-1).push({ x, y: this.#y, text, italic });
    this.#lastY = this.#y;
    this.#y -= LEADING;
    return this;
  }

  // Right-margin revision star on the previously emitted line, the way
  // production drafts mark changed lines.
  star(x = 576) {
    this.#pages.at(-1).push({ x, y: this.#lastY, text: '*' });
    return this;
  }

  // Per-page recipient burn-in: a stamp at a fixed position, optionally
  // rotated (diagonal watermark).
  burnin(text, { x = 108, y = 700, rotate = false } = {}) {
    this.#pages.at(-1).push({ x, y, text, rotate });
    return this;
  }

  header(text, x = X.headerPage) {
    this.#pages.at(-1).push({ x, y: HEADER_Y, text });
    return this;
  }

  blank(n = 1) {
    this.#y -= LEADING * n;
    return this;
  }

  slug(text) {
    return this.#emit(X.margin, text);
  }

  slugNumbered(num, text) {
    const y = this.#y;
    this.#pages.at(-1).push(
      { x: X.sceneNumLeft, y, text: num },
      { x: X.margin, y, text },
      { x: X.sceneNumRight, y, text: num },
    );
    this.#y -= LEADING;
    return this;
  }

  action(...lines) {
    for (const t of lines) this.#emit(X.margin, t);
    return this;
  }

  cue(name) {
    return this.#emit(X.cue, name);
  }

  dualCue(a, b) {
    const y = this.#y;
    this.#pages.at(-1).push({ x: X.cue, y, text: a }, { x: X.cue + 90, y, text: b });
    this.#y -= LEADING;
    return this;
  }

  paren(text) {
    return this.#emit(X.paren, text);
  }

  dualDialogue(a, b) {
    const y = this.#y;
    this.#pages.at(-1).push(
      { x: X.dialogue, y, text: a },
      { x: X.dialogue + 160, y, text: b },
    );
    this.#y -= LEADING;
    return this;
  }

  dialogue(...lines) {
    for (const t of lines) this.#emit(X.dialogue, t);
    return this;
  }

  dialogueItalic(...lines) {
    for (const t of lines) this.#emit(X.dialogue, t, true);
    return this;
  }

  transition(text) {
    return this.#emit(X.transition, text);
  }

  build() {
    return buildPdf(this.#pages.map((runs) => ({ runs })));
  }
}
