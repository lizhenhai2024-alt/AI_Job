import test from 'node:test';
import assert from 'node:assert/strict';
import { appendMetaNote } from '../scripts/job-discovery/meta-note.mjs';

test('appendMetaNote appends a sentence once', () => {
  assert.equal(appendMetaNote('', 'A'), 'A');
  assert.equal(appendMetaNote('A', 'B'), 'A B');
});

test('appendMetaNote is idempotent so a re-run cannot grow the note', () => {
  const sentence = '语言字段规则：仅在正文无语言证据时保留适配器已有字段。';
  const once = appendMetaNote('高校渠道覆盖策略：示例。', sentence);
  const twice = appendMetaNote(once, sentence);
  const thrice = appendMetaNote(twice, sentence);
  assert.equal(twice, once);
  assert.equal(thrice, once);
  assert.equal(once.split(sentence).length - 1, 1);
});

test('appendMetaNote tolerates an empty sentence and normalises spacing', () => {
  assert.equal(appendMetaNote('A  B', ''), 'A B');
  assert.equal(appendMetaNote('  A  ', 'B'), 'A B');
});
