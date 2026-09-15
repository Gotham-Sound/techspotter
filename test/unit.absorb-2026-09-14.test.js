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

// #63/#52 RULED (Peter, 2026-09-14; absorbed early per #68): the comma
// is admissible in exactly the terminal NAME, <suffix> shape, suffixed
// names are distinct performers, and they never fold OR offer against
// the bare base (the offer layer named in the ruling per this bench's
// report). Numbered parts (MERC #1) seat under the same charset ruling.
test('#63 ruling: suffix forms seat distinct; no offer against the base', async () => {
  const p = await parse(['SALLY JR.', 'SALLY, SR.', 'SALLY', 'MERC #1']);
  assert.deepEqual(
    p.characters.map((c) => c.name).sort(),
    ['MERC #1', 'MYRON', 'SALLY', 'SALLY JR', 'SALLY, SR'],
  );
  assert.deepEqual(p.rejects, []);
  assert.deepEqual(p.merge_offers, []);
});

// #66 RULED (Peter, 2026-09-15; absorbed early per #68): a seatable cue
// before the first heading opens an implicit COLD OPEN scene. This
// fixture is bare-slug mode, so the cold open takes ordinal 1 and the
// real slug shifts to 2 (the blessed renumbering); the dialogue seats.
// The negative half: a floating title page (loose vertical gaps) never
// fakes a cold open.
test('#66 ruling: a cold-open cue seats in an implicit leading scene', async () => {
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
  assert.deepEqual(p.scenes.map((s) => [s.id, s.heading]), [
    ['1', 'COLD OPEN'],
    ['2', 'INT. LAB - NIGHT'],
  ]);
  assert.deepEqual(p.characters.map((c) => c.name).sort(), ['MYRON', 'SALLY SR']);
  assert.deepEqual(p.scenes[0].characters_speaking, ['SALLY SR']);
  assert.ok(p.scenes[0].dialogue_by_character['SALLY SR'].includes('before the first slug'));
  assert.deepEqual(p.rejects, []);
});

test('#66 negative: a floating title page never fakes a cold open', async () => {
  const { buildPdf } = await import('./fixtures/pdfgen.js');
  const runs = [
    { x: 266, y: 600, text: 'HENHOUSE PILOT' },
    { x: 180, y: 540, text: 'Written by' },
    { x: 180, y: 500, text: 'A. Writer' },
    { x: 108, y: 448, text: 'INT. COOP - DAY' },
    { x: 266, y: 424, text: 'MYRON' },
    { x: 180, y: 412, text: 'Control.' },
  ];
  const p = parseShow(await extractRuns(buildPdf([{ runs }])));
  assert.deepEqual(p.scenes.map((s) => s.heading), ['INT. COOP - DAY']);
  assert.deepEqual(p.characters.map((c) => c.name), ['MYRON']);
});

// #68 DELTA batch (policy 2026.09.15b): #69 dual split end to end, #71
// numbered-prose boundaries, #70 E/I. parity, and the cold-open
// lowercase-follow fence, each through a real parse.
test('#69: a dual header seats both halves and attributes columns', async () => {
  const { buildPdf } = await import('./fixtures/pdfgen.js');
  const runs = [
    { x: 108, y: 720, text: 'INT. LAB - NIGHT' },
    { x: 266, y: 696, text: 'HOOT' },
    { x: 266 + 90, y: 696, text: 'FRED' },
    { x: 180, y: 684, text: 'Left words here.' },
    { x: 340, y: 684, text: 'Right words here.' },
    { x: 108, y: 660, text: 'They both stop talking.' },
  ];
  const p = parseShow(await extractRuns(buildPdf([{ runs }])));
  assert.deepEqual(p.characters.map((c) => c.name).sort(), ['FRED', 'HOOT']);
  assert.ok(p.scenes[0].dialogue_by_character.HOOT.includes('Left words'));
  assert.ok(p.scenes[0].dialogue_by_character.FRED.includes('Right words'));
  assert.deepEqual(p.rejects, []);
});

test('#71: same number on both margins bounds a prose scene; one margin never does', async () => {
  const { buildPdf } = await import('./fixtures/pdfgen.js');
  const page = (mid) => [
    { x: 60, y: 720, text: '30' },
    { x: 108, y: 720, text: 'INT. PAD - DAY' },
    { x: 552, y: 720, text: '30' },
    { x: 266, y: 696, text: 'MYRON' },
    { x: 180, y: 684, text: 'Go for launch.' },
    ...mid,
    { x: 266, y: 612, text: 'WANDA' },
    { x: 180, y: 600, text: 'Copy that.' },
  ];
  const both = await extractRuns(buildPdf([{ runs: page([
    { x: 60, y: 648, text: '31' },
    { x: 108, y: 648, text: 'The launch intercut continues apace.' },
    { x: 552, y: 648, text: '31' },
  ]) }]));
  const pb = parseShow(both);
  assert.deepEqual(pb.scenes.map((s) => [s.id, s.heading]), [
    ['30', 'INT. PAD - DAY'],
    ['31', 'SCENE 31'],
  ]);
  assert.deepEqual(pb.scenes[1].characters_speaking, ['WANDA']);

  const one = await extractRuns(buildPdf([{ runs: page([
    { x: 60, y: 648, text: '31' },
    { x: 108, y: 648, text: 'The launch intercut continues apace.' },
  ]) }]));
  const po = parseShow(one);
  assert.deepEqual(po.scenes.map((s) => s.id), ['30']);
});

test('#70: E/I. slugs bound scenes', async () => {
  const { buildPdf } = await import('./fixtures/pdfgen.js');
  const runs = [
    { x: 108, y: 720, text: 'INT. LAB - NIGHT' },
    { x: 266, y: 696, text: 'MYRON' },
    { x: 180, y: 684, text: 'Inside.' },
    { x: 108, y: 648, text: 'E/I. AIRLOCK - CONTINUOUS' },
    { x: 266, y: 624, text: 'WANDA' },
    { x: 180, y: 612, text: 'Crossing over.' },
  ];
  const p = parseShow(await extractRuns(buildPdf([{ runs }])));
  assert.deepEqual(p.scenes.map((s) => s.heading), [
    'INT. LAB - NIGHT',
    'E/I. AIRLOCK - CONTINUOUS',
  ]);
});

test('cold-open fence: an all-caps follow never fakes a cold open', async () => {
  const { buildPdf } = await import('./fixtures/pdfgen.js');
  const runs = [
    { x: 266, y: 696, text: 'STANDING SETS' },
    { x: 180, y: 684, text: 'LAUNCH CONTROL' },
    { x: 108, y: 648, text: 'INT. LAB - NIGHT' },
    { x: 266, y: 624, text: 'MYRON' },
    { x: 180, y: 612, text: 'Control.' },
  ];
  const p = parseShow(await extractRuns(buildPdf([{ runs }])));
  assert.deepEqual(p.scenes.map((s) => s.heading), ['INT. LAB - NIGHT']);
  assert.deepEqual(p.characters.map((c) => c.name), ['MYRON']);
});
