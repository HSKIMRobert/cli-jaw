import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { stripInterviewTracker } from '../../src/orchestrator/sanitize.ts';

describe('stripInterviewTracker', () => {
  test('SAN-001: strips tracker fields on separate lines', () => {
    const input = 'Ready.\nassessment: {"goal":"max"}\nknown: [{"fact":"X"}]\nunknown: [{"q":"Y"}]';
    assert.equal(stripInterviewTracker(input), 'Ready.');
  });

  test('SAN-002: strips tracker fields on a single line', () => {
    const input = 'Ready.\n\nassessment: {"goal":"max","c":"high"} known: [{"fact":"X","source":"user"}] unknown: [{"q":"How?"}]';
    assert.equal(stripInterviewTracker(input), 'Ready.');
  });

  test('SAN-003: handles brackets inside JSON string values', () => {
    const input = 'Done.\nassessment: {"goal":"max"} known: [{"fact":"typing [[ creates [[]]","source":"user"}] unknown: [{"q":"scope?"}]';
    assert.equal(stripInterviewTracker(input), 'Done.');
  });

  test('SAN-004: strips XML-tagged tracker blocks', () => {
    const input = 'Hello <interview_tracker>{"a":1}</interview_tracker> world';
    assert.equal(stripInterviewTracker(input), 'Hello  world');
  });

  test('SAN-005: does not strip prose mentioning assessment or known', () => {
    const input = 'The assessment was good. The known issues are listed.';
    assert.equal(stripInterviewTracker(input), input);
  });

  test('SAN-006: strips Perspective tags', () => {
    const input = 'Hello\n[Perspective: user]\nWorld';
    assert.equal(stripInterviewTracker(input), 'Hello\nWorld');
  });

  test('SAN-007: handles assessment-only (no known/unknown)', () => {
    const input = 'Response text.\nassessment: {"goal":"max","status":"ok"}';
    assert.equal(stripInterviewTracker(input), 'Response text.');
  });

  test('SAN-008: handles deeply nested arrays in known field', () => {
    const input = 'Text.\nknown: [{"fact":"data","nested":[1,[2,3]]}]';
    assert.equal(stripInterviewTracker(input), 'Text.');
  });

  test('SAN-009: preserves text when no tracker present', () => {
    const input = 'Normal response with no tracker data at all.';
    assert.equal(stripInterviewTracker(input), input);
  });

  test('SAN-010: strips partial tracker (only known without assessment)', () => {
    const input = 'Response.\nknown: [{"fact":"X"}]\nunknown: [{"q":"Y"}]';
    assert.equal(stripInterviewTracker(input), 'Response.');
  });
});
