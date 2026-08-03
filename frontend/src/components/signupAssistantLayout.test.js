import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSize, getSizeLimits } from './signupAssistantLayout.js';

test('keeps the assistant panel inside a short viewport', () => {
  const viewport = { width: 276, height: 294 };
  const limits = getSizeLimits(viewport);
  const size = clampSize({ width: 440, height: 560 }, viewport);

  assert.equal(limits.widthMax, 260);
  assert.equal(limits.heightMax, 278);
  assert.deepEqual(size, { width: 260, height: 278 });
});

test('keeps the desktop minimum size intact', () => {
  const viewport = { width: 1440, height: 900 };
  const limits = getSizeLimits(viewport);

  assert.equal(limits.widthMin, 280);
  assert.equal(limits.heightMin, 320);
  assert.equal(limits.widthMax, 1424);
  assert.equal(limits.heightMax, 884);
});
