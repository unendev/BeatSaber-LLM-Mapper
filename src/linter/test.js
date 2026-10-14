import assert from 'assert';
import { lintBeatmap, autofixBeatmap, getAngularDifference } from './assertion.js';

console.log('[TEST] Starting Linter unit tests...');

// Test 1: Angular differences
assert.strictEqual(getAngularDifference(0, 1), 180); // Up vs Down = 180 deg
assert.strictEqual(getAngularDifference(0, 0), 0);   // Up vs Up = 0 deg
assert.strictEqual(getAngularDifference(2, 3), 180); // Left vs Right = 180 deg
assert.strictEqual(getAngularDifference(0, 8), 180); // Up vs Dot = neutral

// Test 2: Double Direction Detection
const badBeatmap = {
  _notes: [
    { _time: 1.0, _lineIndex: 1, _lineLayer: 0, _type: 0, _cutDirection: 1 },
    { _time: 1.5, _lineIndex: 1, _lineLayer: 0, _type: 0, _cutDirection: 1 } // DD! Same hand down twice
  ]
};
const rep1 = lintBeatmap(badBeatmap);
assert.strictEqual(rep1.double_direction_count, 1);
assert.strictEqual(rep1.is_valid, false);

// Test 3: Autofix
const { fixedBeatmap, fixedCount } = autofixBeatmap(badBeatmap);
assert.strictEqual(fixedCount, 1);
assert.strictEqual(fixedBeatmap._notes[1]._cutDirection, 0); // Flipped from 1 (down) to 0 (up)

const repFixed = lintBeatmap(fixedBeatmap);
assert.strictEqual(repFixed.double_direction_count, 0);
assert.strictEqual(repFixed.parity_rate_percent, 100);
assert.strictEqual(repFixed.is_valid, true);

// Test 4: Co-location collision detection
const colocationMap = {
  _notes: [
    { _time: 2.0, _lineIndex: 1, _lineLayer: 0, _type: 0, _cutDirection: 1 },
    { _time: 2.0, _lineIndex: 1, _lineLayer: 0, _type: 1, _cutDirection: 1 }
  ]
};
const repColo = lintBeatmap(colocationMap);
assert.strictEqual(repColo.colocation_count, 1);
assert.strictEqual(repColo.is_valid, false);

console.log('✅ [TEST] All Linter & Parity tests passed successfully!');
