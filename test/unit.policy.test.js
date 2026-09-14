// Pins the scriptparse policy mirror (policy_version 2026.09.14,
// absorbed per hub issue #60; prior 2026.07.27b per #33) so it cannot drift silently: the ruled
// contents are asserted as literals here, independent of the mirror file.
// A failure here means the mirror was edited locally — which is never a
// fix; divergences go to the hub as federation motions.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICY,
  foldName,
  isStandardTag,
  CUE_STOP_WORDS,
} from '../src/parser/policy.js';

test('mirror carries the absorbed policy version', () => {
  assert.equal(POLICY.policy_version, '2026.09.14');
});

test('channel_kinds and default: the issue #11 ruling, exactly', () => {
  assert.deepEqual(POLICY.channel_kinds, {
    'ON TV': 'tv',
    'ON SCREEN': 'screen',
    'ON MONITOR': 'screen',
    'ON VIDEO': 'screen',
    'ON RADIO': 'radio',
    'OVER RADIO': 'radio',
    FILTERED: 'filtered',
    'ON COMMS': 'comms',
    'OVER COMMS': 'comms',
    TEXT: 'text',
    TEXTS: 'text',
    POST: 'text',
    POSTS: 'text',
    DM: 'text',
    DMS: 'text',
    VOICE: 'voice',
    VOICEMAIL: 'voice',
    VM: 'voice',
    'ON THE TV': 'tv',
  });
  assert.equal(POLICY.channel_kind_default, 'unknown');
});

test('silent tier: tier moves and the issue #22 phone-device kin', () => {
  assert.deepEqual(POLICY.standard_tags, [
    'V.O.',
    'O.S.',
    'O.C.',
    "CONT'D",
    'ON THE PHONE',
    'ON PHONE',
    'INTERCUT',
    'PRE-LAP',
    'PRELAP',
    'INTO PHONE',
    'OVER THE PHONE',
    'ON SPEAKER',
    'OVER SPEAKER',
    'SPEAKERPHONE',
    // The 2026-08-01 vocabulary batch (issues #44 + #36):
    'OVER PHONE',
    'INTO COMMS',
    'INTO THE COMMS',
  ]);
  // Matching is dot- and space-insensitive (V.O. == VO).
  assert.ok(isStandardTag('VO'));
  assert.ok(isStandardTag('V.O.'));
  assert.ok(isStandardTag('ON  THE PHONE'));
  assert.ok(!isStandardTag('ON TV'));
});

test('DM/DMS joined the TEXT family (memo §3.2 gap, closed)', () => {
  assert.deepEqual(POLICY.possessive_channel_nouns, [
    'TEXT',
    'TEXTS',
    'VOICE',
    'VOICEMAIL',
    'VM',
    'POST',
    'POSTS',
    'DM',
    'DMS',
  ]);
  assert.deepEqual(foldName("MYRON'S DM"), {
    base: 'MYRON',
    channel: 'DM',
    tier: 'channel',
    kind: 'text',
  });
});

test('burn_in rule data: the arithmetic, pinned to the letter', () => {
  assert.deepEqual(POLICY.burn_in, {
    strip_rotated_runs: true,
    repeat_grid_pt: 24,
    repeat_quantizer: 'floor',
    repeat_space: 'anchor-bottom-left-pt',
    repeat_unit: 'word-lower-left',
    repeat_min_pages: 4,
    repeat_page_fraction: 0.5,
    repeat_fraction_rounding: 'ceil',
    repeat_requires_lowercase: true,
    repeat_exempt_trailing_page_token: true,
    single_capital_exempt: true,
  });
});

test('cue stop words: conjunctions + FROM only (MAN IN BLACK ruling)', () => {
  assert.deepEqual([...CUE_STOP_WORDS].sort(), ['AND', 'BUT', 'FROM', 'NOR', 'OR']);
});

test('foldName mirrors the reference interpreter', () => {
  assert.deepEqual(foldName('MYRON (ON TV)'), {
    base: 'MYRON',
    channel: 'ON TV',
    tier: 'channel',
    kind: 'tv',
  });
  assert.deepEqual(foldName('MYRON (V.O.)'), {
    base: 'MYRON',
    channel: null,
    tier: 'standard',
    kind: null,
  });
  // Unknown parentheticals stop the fold: identity, untouched.
  assert.deepEqual(foldName('MYRON (SOBBING)'), {
    base: 'MYRON (SOBBING)',
    channel: null,
    tier: null,
    kind: null,
  });
  // Numbered parts never fold; MOM is not a channel noun.
  assert.equal(foldName('MERC #1').tier, null);
  assert.equal(foldName("MYRON'S MOM").tier, null);
});
