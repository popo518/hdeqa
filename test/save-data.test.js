import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGardenSave, serializeGardenSave } from '../src/save-data.js';

const TODAY = '2026-11-13';

function save(overrides = {}) {
  return JSON.stringify({
    version: 2,
    quality: 'high',
    seeds: 12,
    daily: { day: TODAY, tasks: { subhan: { count: 100, completed: true } } },
    decorations: [{ type: 'tree', x: 10, z: -20, rotation: 1.2 }],
    ...overrides,
  });
}

test('invalid and oversized storage values fall back safely', () => {
  assert.equal(parseGardenSave('{broken', TODAY).seeds, 3);
  assert.equal(parseGardenSave('x'.repeat(1_000_001), TODAY).decorations.length, 0);
  assert.equal(parseGardenSave('null', TODAY).quality, 'auto');
});

test('only the supported save version and quality values are accepted', () => {
  assert.equal(parseGardenSave(save({ version: 99 }), TODAY).quality, 'auto');
  assert.equal(parseGardenSave(save({ quality: 'remote-script' }), TODAY).quality, 'auto');
  assert.equal(parseGardenSave(save({ quality: 'ultra' }), TODAY).quality, 'ultra');
});

test('seed balance and task progress are bounded to valid ranges', () => {
  const parsed = parseGardenSave(save({
    seeds: 9_999_999,
    daily: { day: TODAY, tasks: { subhan: { count: 9_999, completed: true }, istighfar: { count: -9, completed: false } } },
  }), TODAY);
  assert.equal(parsed.seeds, 999999);
  assert.equal(parsed.daily.tasks.subhan.count, 100);
  assert.equal(parsed.daily.tasks.subhan.completed, true);
  assert.equal(parsed.daily.tasks.istighfar.count, 0);
});

test('unknown build types and out-of-world placements are discarded', () => {
  const parsed = parseGardenSave(save({ decorations: [
    { type: 'tree', x: 1, z: 2, rotation: 0 },
    { type: 'script', x: 0, z: 0, rotation: 0 },
    { type: 'tree', x: 9999, z: 0, rotation: 0 },
    { type: 'flower', x: 'not-a-number', z: 0, rotation: 0 },
  ] }), TODAY);
  assert.deepEqual(parsed.decorations.map((item) => item.type), ['tree']);
});

test('daily task progress resets when the calendar day changes', () => {
  const parsed = parseGardenSave(save(), '2026-11-14');
  assert.equal(parsed.daily.day, '2026-11-14');
  assert.equal(parsed.daily.tasks.subhan, undefined);
});

test('serialized state can be parsed back without losing valid decorations', () => {
  const encoded = serializeGardenSave({
    quality: 'medium',
    seeds: 7,
    daily: { day: TODAY, tasks: {} },
    decorations: [{ type: 'bench', x: 4, z: 8, rotation: 0.5 }],
  });
  const parsed = parseGardenSave(encoded, TODAY);
  assert.equal(parsed.quality, 'medium');
  assert.equal(parsed.seeds, 7);
  assert.equal(parsed.decorations[0].type, 'bench');
});
