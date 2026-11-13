import assert from 'node:assert/strict';
import { riverCenterX, riverSurfaceY, terrainHeight } from '../src/terrain.js';
import { recordTaskCompletion, spendResources } from '../src/ledger.js';
import {
  BUILD_ITEMS, TASKS, createInitialState, normalizeState,
  localDateKey, taskInstanceId, rewardText, canAfford, resourceSummary,
} from '../src/data.js';

const state = createInitialState();
assert.equal(state.schemaVersion, 1);
assert.ok(state.worldSeed > 0);
assert.equal(state.placedItems.length, 0);
assert.equal(state.resources.seeds, 8);
assert.equal(state.resources.wood, 12);
assert.equal(state.resources.stone, 10);
assert.equal(TASKS.length, 9);
assert.equal(BUILD_ITEMS.length, 6);
assert.equal(taskInstanceId('fajr', '2026-11-13'), '2026-11-13:fajr');
assert.equal(localDateKey(new Date(2026, 10, 13)), '2026-11-13');
assert.equal(rewardText({ seeds: 2, wood: 1 }), '2 بذور • 1 خشب');
assert.equal(canAfford({ seeds: 4, wood: 2 }, { seeds: 3 }), true);
assert.equal(canAfford({ seeds: 1, wood: 2 }, { seeds: 3 }), false);
assert.deepEqual(resourceSummary({ seeds: 2, wood: 3, stone: 4 }).map(x => x.amount), [2, 3, 4]);

const imported = normalizeState({
  schemaVersion: 1,
  worldSeed: 42,
  resources: { seeds: 1 },
  placedItems: [{ id: 'saved-flower', type: 'flower', x: 1, z: 2 }],
});
assert.equal(imported.worldSeed, 42);
assert.deepEqual(imported.resources, { seeds: 1, wood: 12, stone: 10 });
assert.equal(imported.placedItems[0].id, 'saved-flower');
assert.equal(imported.settings.prayerTimes.fajr, '');

assert.ok(Number.isFinite(riverCenterX(120)));
assert.ok(Number.isFinite(riverSurfaceY(-80)));
assert.ok(Number.isFinite(terrainHeight(4, 9)));
assert.ok(riverSurfaceY(0) > terrainHeight(riverCenterX(0), 0));
assert.ok(Math.abs(terrainHeight(14, 12) - terrainHeight(14.01, 12)) < 0.1);

const ledgerState = createInitialState();
const sampleTask = TASKS.find(task => task.id === 'quran');
const awarded = recordTaskCompletion(ledgerState, sampleTask, '2026-11-13', '2026-11-13T12:00:00.000Z', 'test-reward-1');
assert.equal(awarded.ok, true);
assert.equal(ledgerState.resources.seeds, 9);
assert.equal(ledgerState.resources.stone, 11);
const duplicateAward = recordTaskCompletion(ledgerState, sampleTask, '2026-11-13', '2026-11-13T12:01:00.000Z', 'test-reward-2');
assert.equal(duplicateAward.ok, false);
assert.equal(ledgerState.resources.seeds, 9);
assert.equal(ledgerState.transactions.filter(tx => tx.type === 'task-reward').length, 1);
assert.match(ledgerState.history.at(-1).description, /بذور/);
const sources = spendResources(ledgerState, { seeds: 3, stone: 1 });
assert.ok(sources && sources.length > 0);
assert.equal(ledgerState.resources.seeds, 6);
assert.equal(ledgerState.resources.stone, 10);
assert.ok(sources.some(source => source.taskId === 'quran'));
const beforeFailedSpend = JSON.stringify({ resources: ledgerState.resources, lots: ledgerState.resourceLots });
assert.equal(spendResources(ledgerState, { wood: 999 }), null);
assert.equal(JSON.stringify({ resources: ledgerState.resources, lots: ledgerState.resourceLots }), beforeFailedSpend);

for (const task of TASKS) {
  assert.ok(task.id && task.title && task.reward);
  assert.ok(Object.keys(task.reward).every(key => ['seeds', 'wood', 'stone'].includes(key)));
}
for (const item of BUILD_ITEMS) {
  assert.ok(item.id && item.name && item.cost);
  assert.ok(Object.keys(item.cost).every(key => ['seeds', 'wood', 'stone'].includes(key)));
}

console.log('MY GARDEN core data tests: PASS');
