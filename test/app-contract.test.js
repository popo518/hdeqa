import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scene = await readFile(new URL('../src/scene.js', import.meta.url), 'utf8');

test('Vite entry path is relative for GitHub Pages project paths', () => {
  assert.match(html, /src="\.\/src\/scene\.js"/);
  assert.doesNotMatch(html, /src="\/src\/scene\.js"/);
});

test('the top-level interface stays limited to build, tasks, and settings', () => {
  assert.match(html, /id="settingsToggle"/);
  assert.match(html, /id="tasksToggle"/);
  assert.match(html, /id="buildToggle"/);
  assert.doesNotMatch(html, /id="(prayer|dhikr|library|inventory)Toggle"/);
});

test('the daily mission remains the requested dhikr and scene has movement and zoom guards', () => {
  assert.match(scene, /title: 'سبحان الله وبحمده'/);
  assert.match(scene, /import \{ isWalkablePosition \} from '\.\/world-rules\.js'/);
  assert.match(scene, /cameraDistance = clampNumber\(/);
});
