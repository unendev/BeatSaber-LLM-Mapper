import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parses a single hand token like 'R101' or 'B201'
 * R = Red (Left, type 0), B = Blue (Right, type 1)
 */
export function parseToken(token, defaultType = null) {
  const clean = token.trim();
  if (!clean) return null;

  let handChar = clean[0].toUpperCase();
  let rest = clean.slice(1);
  let type = defaultType;

  if (handChar === 'R') {
    type = 0;
  } else if (handChar === 'B') {
    type = 1;
  } else if (/^[0-3]/.test(handChar)) {
    // No hand prefix, infer from context
    rest = clean;
    if (type === null) type = 0;
  } else {
    return null;
  }

  if (rest.length < 3) return null;

  const lineIndex = parseInt(rest[0], 10);
  const lineLayer = parseInt(rest[1], 10);
  const cutDirection = parseInt(rest[2], 10);

  if (
    isNaN(lineIndex) || lineIndex < 0 || lineIndex > 3 ||
    isNaN(lineLayer) || lineLayer < 0 || lineLayer > 2 ||
    isNaN(cutDirection) || cutDirection < 0 || cutDirection > 8
  ) {
    return null;
  }

  return {
    _lineIndex: lineIndex,
    _lineLayer: lineLayer,
    _type: type,
    _cutDirection: cutDirection
  };
}

/**
 * Transpiles BS-DSL text into standard Beat Saber V2 JSON structure
 */
export function dslToBeatmap(dslText) {
  const lines = dslText.split('\n');
  const notes = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    let line = lines[lineNum].trim();
    
    // Strip comments
    line = line.replace(/#.*$/, '').replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    // Pattern: "beat: left | right" or "beat: tokens..."
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const beatStr = line.slice(0, colonIdx).trim();
    const time = parseFloat(beatStr);
    if (isNaN(time)) continue;

    const body = line.slice(colonIdx + 1).trim();
    if (!body) continue;

    if (body.includes('|')) {
      const [leftPart, rightPart] = body.split('|').map(s => s.trim());

      if (leftPart) {
        const tokens = leftPart.split(/\s+/).filter(Boolean);
        for (const tok of tokens) {
          const parsed = parseToken(tok, 0);
          if (parsed) {
            notes.push({ _time: time, ...parsed });
          }
        }
      }

      if (rightPart) {
        const tokens = rightPart.split(/\s+/).filter(Boolean);
        for (const tok of tokens) {
          const parsed = parseToken(tok, 1);
          if (parsed) {
            notes.push({ _time: time, ...parsed });
          }
        }
      }
    } else {
      // Freeform space-separated tokens
      const tokens = body.split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        const parsed = parseToken(tok, null);
        if (parsed) {
          notes.push({ _time: time, ...parsed });
        }
      }
    }
  }

  // Sort notes chronologically, then by hand
  notes.sort((a, b) => {
    if (Math.abs(a._time - b._time) > 1e-4) {
      return a._time - b._time;
    }
    return a._type - b._type;
  });

  return {
    _version: "2.2.0",
    _notes: notes,
    _obstacles: [],
    _events: []
  };
}

/**
 * Reverse transpiles standard Beat Saber notes to BS-DSL text
 */
export function beatmapToDsl(beatmap) {
  const notes = beatmap._notes || [];
  const beatGroups = new Map();

  for (const note of notes) {
    const timeKey = Number(note._time.toFixed(3));
    if (!beatGroups.has(timeKey)) {
      beatGroups.set(timeKey, { left: [], right: [] });
    }
    const group = beatGroups.get(timeKey);
    const token = `${note._type === 0 ? 'R' : 'B'}${note._lineIndex}${note._lineLayer}${note._cutDirection}`;
    if (note._type === 0) group.left.push(token);
    else group.right.push(token);
  }

  const lines = [];
  const sortedTimes = Array.from(beatGroups.keys()).sort((a, b) => a - b);

  for (const t of sortedTimes) {
    const { left, right } = beatGroups.get(t);
    const leftStr = left.join(' ');
    const rightStr = right.join(' ');
    if (right.length > 0) {
      lines.push(`${t}: ${leftStr} | ${rightStr}`);
    } else {
      lines.push(`${t}: ${leftStr}`);
    }
  }

  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputDslPath = process.argv[2] || path.resolve(__dirname, '../../dataset/test_flow.dsl');
  const outputDatPath = process.argv[3] || path.resolve(__dirname, '../../dataset/ExpertPlus.dat');

  const dslContent = fs.readFileSync(inputDslPath, 'utf-8');
  const beatmap = dslToBeatmap(dslContent);

  fs.writeFileSync(outputDatPath, JSON.stringify(beatmap, null, 2), 'utf-8');
  console.log(`[Transpiler] Successfully compiled ${inputDslPath} -> ${outputDatPath}`);
  console.log(`[Transpiler] Total notes compiled: ${beatmap._notes.length}`);
}
