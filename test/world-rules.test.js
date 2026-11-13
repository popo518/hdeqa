import test from 'node:test';
import assert from 'node:assert/strict';
import { isBridgeDeck, isWalkablePosition } from '../src/world-rules.js';

const riverAtCenter = () => 0;
const noRiver = () => 100;

test('open terrain is walkable, but the river itself is blocked', () => {
  assert.equal(isWalkablePosition(12, -8, { riverDistance: noRiver }), true);
  assert.equal(isWalkablePosition(12, -8, { riverDistance: riverAtCenter }), false);
});

test('the bridge deck permits crossing through the river buffer', () => {
  const bridges = [{ x: 0, z: 0, angle: 0 }];
  assert.equal(isWalkablePosition(8, 0, { riverDistance: riverAtCenter, bridges }), true);
  assert.equal(isWalkablePosition(0, 2, { riverDistance: riverAtCenter, bridges }), true);
  assert.equal(isWalkablePosition(0, 3, { riverDistance: riverAtCenter, bridges }), false);
});

test('bridge orientation is respected after rotation', () => {
  const bridges = [{ x: 5, z: -4, angle: Math.PI / 2 }];
  assert.equal(isBridgeDeck(5, 4, bridges), true);
  assert.equal(isBridgeDeck(8, -4, bridges), false);
});

test('the player cannot walk outside the world boundary or through invalid coordinates', () => {
  assert.equal(isWalkablePosition(262, 0, { worldHalf: 270, riverDistance: noRiver }), false);
  assert.equal(isWalkablePosition(Number.NaN, 0, { riverDistance: noRiver }), false);
  assert.equal(isWalkablePosition(2, 0, { worldHalf: 10, margin: 9, riverDistance: noRiver }), false);
});
