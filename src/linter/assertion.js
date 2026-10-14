import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Direction angles in degrees (0: Up, 1: Down, 2: Left, 3: Right, 4: Up-Left, 5: Up-Right, 6: Down-Left, 7: Down-Right, 8: Dot)
export const DIR_ANGLES_DEG = {
  0: 90,
  1: 270,
  2: 180,
  3: 0,
  4: 135,
  5: 45,
  6: 225,
  7: 315,
  8: null // Dot has no fixed direction
};

// Opposite direction mapping (180 deg reversal)
export const OPPOSITE_DIRS = {
  0: 1, // Up -> Down
  1: 0, // Down -> Up
  2: 3, // Left -> Right
  3: 2, // Right -> Left
  4: 7, // Up-Left -> Down-Right
  5: 6, // Up-Right -> Down-Left
  6: 5, // Down-Left -> Up-Right
  7: 4, // Down-Right -> Up-Left
  8: 8  // Dot stays Dot
};

/**
 * Computes angular difference between two cut directions (0..180)
 */
export function getAngularDifference(dirA, dirB) {
  if (dirA === 8 || dirB === 8) return 180; // Dot resets flow naturally
  const angleA = DIR_ANGLES_DEG[dirA];
  const angleB = DIR_ANGLES_DEG[dirB];
  if (angleA === null || angleB === null) return 180;

  const diff = Math.abs(angleA - angleB) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Runs kinematic parity and physical ergonomic linting on notes
 */
export function lintBeatmap(beatmap, bpm = 128.0) {
  const notes = (beatmap._notes || []).slice().sort((a, b) => a._time - b._time);
  const secondsPerBeat = 60.0 / bpm;

  const errors = [];
  const warnings = [];

  let redCuts = 0;
  let blueCuts = 0;
  let parityValidCuts = 0;
  let totalDirectionalPairs = 0;
  let ddCount = 0;
  let colocationCount = 0;
  let visionBlockCount = 0;
  let armCrossCount = 0;

  // 1. Co-location & Arm Cross Check (group by beat)
  const beatGroups = new Map();
  for (const note of notes) {
    const t = Number(note._time.toFixed(3));
    if (!beatGroups.has(t)) beatGroups.set(t, []);
    beatGroups.get(t).push(note);
  }

  for (const [time, group] of beatGroups.entries()) {
    // Check co-location
    const posSet = new Set();
    for (const note of group) {
      const posKey = `${note._lineIndex},${note._lineLayer}`;
      if (posSet.has(posKey)) {
        colocationCount++;
        errors.push({
          type: 'COLOCATION_ERROR',
          time,
          message: `同拍同轨重叠冲突: Beat ${time} at (${note._lineIndex}, ${note._lineLayer})`
        });
      }
      posSet.add(posKey);
    }

    // Check Arm Cross at same beat
    const reds = group.filter(n => n._type === 0);
    const blues = group.filter(n => n._type === 1);
    for (const r of reds) {
      for (const b of blues) {
        if (r._lineIndex > b._lineIndex) {
          armCrossCount++;
          warnings.push({
            type: 'ARM_CROSS_WARNING',
            time,
            message: `手臂交叉风险: Beat ${time} (左手 x=${r._lineIndex} > 右手 x=${b._lineIndex})`
          });
        }
      }
    }
  }

  // 2. Parity & Flow Check per hand
  const hands = [0, 1]; // 0: Left/Red, 1: Right/Blue
  for (const hand of hands) {
    const handNotes = notes.filter(n => n._type === hand);
    if (hand === 0) redCuts = handNotes.length;
    else blueCuts = handNotes.length;

    for (let i = 1; i < handNotes.length; i++) {
      const prev = handNotes[i - 1];
      const curr = handNotes[i];
      const deltaBeat = curr._time - prev._time;
      const deltaTimeSec = deltaBeat * secondsPerBeat;

      // Skip check if time gap is long enough for natural reset (> 1.75 beats or > 0.8s)
      if (deltaBeat > 1.75 || deltaTimeSec > 0.8) {
        continue;
      }

      if (prev._cutDirection !== 8 && curr._cutDirection !== 8) {
        totalDirectionalPairs++;
        const angleDiff = getAngularDifference(prev._cutDirection, curr._cutDirection);

        if (angleDiff < 50) {
          // Double Direction
          ddCount++;
          errors.push({
            type: 'DOUBLE_DIRECTION_ERROR',
            hand: hand === 0 ? 'Left(Red)' : 'Right(Blue)',
            time: curr._time,
            prevDir: prev._cutDirection,
            currDir: curr._cutDirection,
            angleDiff,
            message: `严重 Double-Direction 违规: ${hand === 0 ? '左手' : '右手'} 在 Beat ${curr._time} 连续同向切角 (角度差 ${angleDiff}°)`
          });
        } else if (angleDiff >= 135) {
          parityValidCuts++;
        } else {
          // Soft flow transition (90 deg)
          if (deltaBeat <= 0.5) {
            warnings.push({
              type: 'ACCUTE_CUT_WARNING',
              hand: hand === 0 ? 'Left' : 'Right',
              time: curr._time,
              angleDiff,
              message: `急促侧切转角: Beat ${curr._time} (角度差 ${angleDiff}°)`
            });
          }
          parityValidCuts++;
        }
      }
    }
  }

  // 3. Vision Block Check
  for (let i = 0; i < notes.length; i++) {
    const front = notes[i];
    // Eye level is layer 1 or 2 at center lanes (1, 2)
    if ((front._lineIndex === 1 || front._lineIndex === 2) && front._lineLayer >= 1) {
      for (let j = i + 1; j < notes.length; j++) {
        const behind = notes[j];
        const dt = (behind._time - front._time) * secondsPerBeat;
        if (dt > 0.25) break; // Beyond vision block window
        if (behind._lineIndex === front._lineIndex && behind._lineLayer === front._lineLayer && dt > 0.05) {
          visionBlockCount++;
          warnings.push({
            type: 'VISION_BLOCK_WARNING',
            time: behind._time,
            message: `视线遮挡警告: Beat ${behind._time} 正前方在 ${dt.toFixed(2)}s 内被前置方块遮挡`
          });
        }
      }
    }
  }

  const parityComplianceRate = totalDirectionalPairs > 0 
    ? Math.max(0, Math.min(100, ((totalDirectionalPairs - ddCount) / totalDirectionalPairs) * 100))
    : 100;

  const score = Math.max(0, Math.round(
    100 - (ddCount * 15) - (colocationCount * 20) - (visionBlockCount * 5) - (armCrossCount * 3)
  ));

  return {
    total_notes: notes.length,
    red_notes: redCuts,
    blue_notes: blueCuts,
    total_directional_pairs: totalDirectionalPairs,
    double_direction_count: ddCount,
    colocation_count: colocationCount,
    vision_block_count: visionBlockCount,
    arm_cross_count: armCrossCount,
    parity_rate_percent: Number(parityComplianceRate.toFixed(1)),
    overall_score: Math.max(0, score),
    is_valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Deterministically auto-fixes parity errors and minor physical violations
 */
export function autofixBeatmap(beatmap, bpm = 128.0) {
  const cloned = JSON.parse(JSON.stringify(beatmap));
  const notes = cloned._notes || [];
  notes.sort((a, b) => a._time - b._time);

  const secondsPerBeat = 60.0 / bpm;
  let fixedCount = 0;

  // 1. Fix Co-location
  const seenPos = new Map();
  const validNotes = [];
  for (const note of notes) {
    const key = `${note._time.toFixed(3)}@${note._lineIndex},${note._lineLayer}`;
    if (seenPos.has(key)) {
      // Shift layer or lane if possible, else drop
      if (note._lineLayer < 2) {
        note._lineLayer++;
        fixedCount++;
        validNotes.push(note);
      }
    } else {
      seenPos.set(key, true);
      validNotes.push(note);
    }
  }
  cloned._notes = validNotes;

  // 2. Fix Double Directions per hand
  for (const hand of [0, 1]) {
    const handNotes = validNotes.filter(n => n._type === hand);
    for (let i = 1; i < handNotes.length; i++) {
      const prev = handNotes[i - 1];
      const curr = handNotes[i];
      const deltaBeat = curr._time - prev._time;
      const dt = deltaBeat * secondsPerBeat;

      if (deltaBeat <= 1.75 && dt <= 0.8) {
        if (prev._cutDirection !== 8 && curr._cutDirection !== 8) {
          const angleDiff = getAngularDifference(prev._cutDirection, curr._cutDirection);
          if (angleDiff < 50) {
            // Revert by 180 degrees to restore ergonomic recoil swing!
            const flipped = OPPOSITE_DIRS[curr._cutDirection];
            curr._cutDirection = flipped;
            fixedCount++;
          }
        }
      }
    }
  }

  return { fixedBeatmap: cloned, fixedCount };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mapPath = process.argv[2] || path.resolve(__dirname, '../../dataset/ExpertPlus.dat');
  const raw = fs.readFileSync(mapPath, 'utf-8');
  const beatmap = JSON.parse(raw);

  const report = lintBeatmap(beatmap, 128.0);
  console.log('='.repeat(60));
  console.log('         BEATSABER KINEMATIC LINTER REPORT');
  console.log('='.repeat(60));
  console.log(`Total Notes:              ${report.total_notes} (Red: ${report.red_notes}, Blue: ${report.blue_notes})`);
  console.log(`Parity Compliance Rate:   ${report.parity_rate_percent}%`);
  console.log(`Overall Physical Score:   ${report.overall_score} / 100`);
  console.log(`Double Direction Violations: ${report.double_direction_count}`);
  console.log(`Co-location Collisions:      ${report.colocation_count}`);
  console.log(`Vision Block Warnings:       ${report.vision_block_count}`);
  console.log(`Arm Cross Warnings:          ${report.arm_cross_count}`);
  console.log(`Is Physically Valid:      ${report.is_valid ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('='.repeat(60));

  if (report.errors.length > 0) {
    console.log('\n[ERRORS]');
    report.errors.forEach(e => console.log(`  - ${e.message}`));
  }
  if (report.warnings.length > 0) {
    console.log('\n[WARNINGS]');
    report.warnings.slice(0, 5).forEach(w => console.log(`  - ${w.message}`));
    if (report.warnings.length > 5) {
      console.log(`  ... and ${report.warnings.length - 5} more warnings`);
    }
  }
}
