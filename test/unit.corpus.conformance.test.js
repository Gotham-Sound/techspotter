// The hub conformance corpus (scriptparse issue #40, Phase 0), run
// through THIS bench's policy mirror per the inverted-verification
// protocol: vendored under test/conformance/ pinned by checksum, every
// case asserted against the js interpreter's own functions. This run is
// the second-engine proof of the two cross-language cliff vectors in
// vectors/burn_in.json (floor-vs-round at half-grid; anchor space vs
// top-left on mixed page heights). Corpus words arrive in pdfplumber
// top-left space; the §3.5 anchor transform (y = page_height - bottom)
// is applied at the boundary, exactly as the extractor does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  POLICY,
  foldName,
  partOf,
  parts,
  foldCandidates,
} from '../src/parser/policy.js';
import { stripBurnIns, cell, repeatThreshold } from '../src/parser/burnin.js';
import { evaluateCue, normCue, cueCharsetOk, splitDualHeader } from '../src/parser/cues.js';
import { classifyMarginRow } from '../src/parser/heading.js';
import { BANDS } from '../src/parser/constants.js';

// The ack number for corpus 2026.09.17a (#98; classify_margin_row).
const MANIFEST_ACK =
  '01802dbda53d2b3a5181b736cc66357c62b3c7c7bdac6c8decbaf7911256c78d';

const dir = new URL('./conformance/', import.meta.url);
const raw = (p) => readFileSync(new URL(p, dir));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const manifest = JSON.parse(raw('manifest.json'));
const vectors = (name) => JSON.parse(raw(`vectors/${name}.json`));

test('corpus manifest matches the ack number and binds our policy pin', () => {
  assert.equal(sha256(raw('manifest.json')), MANIFEST_ACK);
  assert.equal(manifest.policy_version, POLICY.policy_version);
  for (const f of manifest.files) {
    assert.equal(sha256(raw(f.path)), f.sha256, f.path);
  }
});

test('fold.json: fold(cue) -> {base, channel, tier, kind}', () => {
  const { cases } = vectors('fold');
  assert.equal(cases.length, 51);
  for (const c of cases) {
    const f = foldName(c.cue);
    assert.deepEqual(
      { base: f.base, channel: f.channel, tier: f.tier, kind: f.kind },
      c.expect,
      c.cue,
    );
  }
});

// cue_semantic_ok is expressed through the engine's own gate: a
// synthesized cue-band line with dialogue following, empty furniture
// context. Accept = true; a named gate reject (or no cue at all) = false.
function cueSemanticOk(cue) {
  const x = BANDS.cue[0];
  const line = {
    y: 400,
    minX: x,
    maxX: x + 7.2 * cue.length,
    segments: [{ x0: x, x1: x + 7.2 * cue.length, text: cue }],
    font: null,
    text: cue,
  };
  const next = { y: 388, minX: BANDS.dialogue[0], text: 'Placeholder.' };
  const r = evaluateCue(line, next, { furniture: new Set() });
  return Boolean(r && r.accept);
}

// The "MYRON-" divergence pin (motion #42) dropped 2026-09-14: the
// ruling landed as policy data (cue_reject_trailing) and this engine
// absorbed it, so the vector asserts equality like every other.
test('cue_gate.json: cue_semantic_ok(cue) -> bool', () => {
  const { cases } = vectors('cue_gate');
  assert.equal(cases.length, 22);
  for (const c of cases) {
    assert.equal(cueSemanticOk(c.cue), c.expect, c.cue);
  }
});

test('charset.json: cue_charset_ok(cue) -> bool (ruled shape admissions)', () => {
  const { cases } = vectors('charset');
  assert.equal(cases.length, 19);
  for (const c of cases) {
    assert.equal(cueCharsetOk(c.cue), c.expect, c.cue);
  }
});

test('normalize.json: norm_cue(raw) -> canonical cue string', () => {
  const { cases } = vectors('normalize');
  assert.equal(cases.length, 15);
  for (const c of cases) {
    assert.equal(normCue(c.raw), c.expect, JSON.stringify(c.raw));
  }
});

test('part_of.json: aliases win; blank canonical keeps separate', () => {
  const { cases } = vectors('part_of');
  assert.equal(cases.length, 11);
  for (const c of cases) {
    assert.equal(partOf(c.cue, c.aliases), c.expect, c.cue);
  }
});

test('parts.json: derivation with anchors; characters never mutated', () => {
  const { cases } = vectors('parts');
  assert.equal(cases.length, 2);
  for (const c of cases) {
    const before = JSON.stringify(c.parse);
    assert.deepEqual(parts(c.parse, c.aliases), c.expect, c.name);
    assert.equal(JSON.stringify(c.parse), before, `${c.name}: input mutated`);
  }
});

test('offers.json: fold_candidates(names), channel tier only', () => {
  const { cases } = vectors('offers');
  assert.equal(cases.length, 2);
  for (const c of cases) {
    assert.deepEqual(foldCandidates(c.names), c.expect);
  }
});

test('dual.json: split_dual_header -> [left, right, boundary] or null', () => {
  const { cases } = vectors('dual');
  assert.equal(cases.length, 7);
  for (const c of cases) {
    assert.deepEqual(splitDualHeader(c.words), c.expect, JSON.stringify(c.words));
  }
});

test('margin_rows.json: classify_margin_row, all six kinds', () => {
  const { cases } = vectors('margin_rows');
  assert.equal(cases.length, 20);
  for (const c of cases) {
    assert.deepEqual(
      classifyMarginRow(c.text, c.in_margin, c.numbered_mode, c.open_scene_id),
      c.expect,
      c.text,
    );
  }
});

// pdfplumber word (top-left space) -> engine run (§3.5 anchor space).
const toRun = (w, pageHeight) => ({
  x: w.x0,
  y: pageHeight - w.bottom,
  width: w.x1 - w.x0,
  str: w.text,
});

test('burn_in.json quantizer: floor cells in anchor space (cliff vector)', () => {
  const { quantizer } = vectors('burn_in');
  assert.equal(quantizer.length, 6);
  for (const c of quantizer) {
    const run = toRun(c.word, c.page_height);
    assert.deepEqual(
      [cell(run.x, c.grid), cell(run.y, c.grid)],
      c.expect_cell,
      JSON.stringify(c.word),
    );
  }
});

test('burn_in.json thresholds: max(min_pages, ceil(pages * fraction))', () => {
  const { thresholds } = vectors('burn_in');
  assert.equal(thresholds.length, 8);
  for (const c of thresholds) {
    assert.equal(repeatThreshold(c.pages), c.expect_threshold, `pages=${c.pages}`);
  }
});

test('burn_in.json detect: strip decisions through the engine', () => {
  const { detect } = vectors('burn_in');
  assert.equal(detect.length, 6);
  for (const c of detect) {
    const runPages = c.pages.map((words, p) =>
      words.map((w) => toRun(w, c.page_heights[p])),
    );
    const { pages: cleaned } = stripBurnIns(runPages);
    const stripped = runPages.map((runs, p) => {
      const kept = new Set(cleaned[p]);
      return runs.flatMap((r, i) => (kept.has(r) ? [] : [i])).sort((a, b) => a - b);
    });
    assert.deepEqual(stripped, c.expect_strip_indices, c.name);
  }
});
