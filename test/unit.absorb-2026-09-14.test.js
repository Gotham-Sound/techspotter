// End-to-end pins for the policy 2026.09.14 absorption (hub issue #60):
// the (MORE) furniture class (#56, this bench's field bug), the INTO
// COMMS silent fold (#44, Patrick's show), the silent trailing-glyph
// refusal (#42), and the normalize layer's colon-cue seating — each
// through a real PDF parse, not just the corpus contract.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf } from './fixtures/pdfgen.js';
import { extractRuns } from './helpers/extract.js';
import { parseShow } from '../src/parser/parse.js';

const X = { margin: 108, dialogue: 180, cue: 266 };

async function parse(cueLines) {
  const runs = [
    { x: X.margin, y: 720, text: 'INT. LAB - NIGHT' },
    { x: X.cue, y: 696, text: 'MYRON' },
    { x: X.dialogue, y: 684, text: 'Control line.' },
  ];
  let y = 660;
  for (const text of cueLines) {
    runs.push({ x: X.cue, y, text });
    runs.push({ x: X.dialogue, y: y - 12, text: 'Some words follow here.' });
    y -= 36;
  }
  return parseShow(await extractRuns(buildPdf([{ runs }])));
}

test('(MORE) and MORE at the cue band are furniture: no seat, no chip', async () => {
  const p = await parse(['(MORE)', 'MORE', 'CONTINUED']);
  assert.deepEqual(p.characters.map((c) => c.name), ['MYRON']);
  assert.deepEqual(p.rejects, []);
});

test('INTO COMMS folds silently at the cue: one column, no offer', async () => {
  const p = await parse(['BILL', 'BILL (INTO COMMS)']);
  assert.deepEqual(p.characters.map((c) => c.name).sort(), ['BILL', 'MYRON']);
  assert.deepEqual(p.merge_offers, []);
  assert.deepEqual(p.rejects, []);
});

test('trailing-glyph cue refusal is silent (#42): no seat, no chip', async () => {
  const p = await parse(['CUT TO -', 'MYRON-']);
  assert.deepEqual(p.characters.map((c) => c.name), ['MYRON']);
  assert.deepEqual(p.rejects, []);
});

test('normalize seats colon and doubled-word cues under the plain name', async () => {
  const p = await parse(['WANDA:', 'WANDA WANDA']);
  assert.deepEqual(p.characters.map((c) => c.name).sort(), ['MYRON', 'WANDA']);
  assert.deepEqual(p.rejects, []);
});

// PRE-#63 PIN (hub motion #63/#52, ruling pending): the generational-
// suffix class as it stands under policy 2026.09.14, verified in the
// field 2026-09-14. When the name_suffixes bump absorbs, this pin MUST
// change with it: the comma form seats, suffixed names never fold or
// offer against the bare base (gate the surname-prefix offer family),
// and this comment goes away.
test('pre-#63 pin: comma suffix chips, no-comma seats, base draws an offer', async () => {
  const p = await parse(['SALLY JR.', 'SALLY, SR.', 'SALLY']);
  assert.deepEqual(
    p.characters.map((c) => c.name).sort(),
    ['MYRON', 'SALLY', 'SALLY JR'],
  );
  assert.deepEqual(
    p.rejects.map((r) => [r.name, r.reason]),
    [['SALLY, SR', "charset ','"]],
  );
  assert.deepEqual(
    p.merge_offers.map((o) => [o.variant, o.canonical]),
    [['SALLY JR', 'SALLY']],
  );
});

// PRE-#66 PIN (hub motion #66, ruling pending): content before the
// first slugline is invisible to the parse: the cue does not seat, does
// not chip, and its dialogue reaches no scene. Silent loss, both
// engines, field-hit by the SALLY draft's cold open. When the #66
// ruling absorbs, this pin flips: dialogue-bearing front matter becomes
// an implicit leading scene and/or its cue-shaped lines chip loudly.
test('pre-#66 pin: a cold-open cue before the first slug is silently lost', async () => {
  const { buildPdf } = await import('./fixtures/pdfgen.js');
  const runs = [
    { x: 108, y: 720, text: 'Over black, a voice.' },
    { x: 266, y: 696, text: 'SALLY SR.' },
    { x: 180, y: 684, text: 'I speak before the first slug.' },
    { x: 108, y: 648, text: 'INT. LAB - NIGHT' },
    { x: 266, y: 624, text: 'MYRON' },
    { x: 180, y: 612, text: 'Control.' },
  ];
  const p = parseShow(await extractRuns(buildPdf([{ runs }])));
  assert.deepEqual(p.characters.map((c) => c.name), ['MYRON']);
  assert.deepEqual(p.rejects, []);
  assert.equal(p.scenes.length, 1);
});
