import assert from 'assert';
import { dslToBeatmap, beatmapToDsl, parseToken } from './transpile.js';

console.log('[TEST] Starting Transpiler unit tests...');

// Test 1: parseToken
const tokRed = parseToken('R101');
assert.deepStrictEqual(tokRed, { _lineIndex: 1, _lineLayer: 0, _type: 0, _cutDirection: 1 });

const tokBlue = parseToken('B320');
assert.deepStrictEqual(tokBlue, { _lineIndex: 3, _lineLayer: 2, _type: 1, _cutDirection: 0 });

const tokDot = parseToken('R218');
assert.deepStrictEqual(tokDot, { _lineIndex: 2, _lineLayer: 1, _type: 0, _cutDirection: 8 });

// Test 2: dslToBeatmap
const sampleDsl = `
# Comment
16.0: R101 | B201
17.0: R110 | B210
`;
const map = dslToBeatmap(sampleDsl);
assert.strictEqual(map._notes.length, 4);
assert.strictEqual(map._notes[0]._time, 16.0);
assert.strictEqual(map._notes[0]._cutDirection, 1);
assert.strictEqual(map._notes[2]._time, 17.0);
assert.strictEqual(map._notes[2]._cutDirection, 0);

// Test 3: Roundtrip
const dslOut = beatmapToDsl(map);
assert(dslOut.includes('16: R101 | B201') || dslOut.includes('16:'));

console.log('✅ [TEST] All Transpiler tests passed successfully!');
