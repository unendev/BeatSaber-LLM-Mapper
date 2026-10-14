import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callLlmApi, sanitizeDslText } from './generate_dsl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced Kinematic Choreographer with Dynamic Section Patterns
 * (Build-up ladders, Drop streams, Windmill diagonals, Parity preservation)
 */
export function choreographWindow(windowBars, initialHandState = null) {
  const dslLines = [];

  // 1 = Down, 0 = Up
  let leftLastDir = initialHandState?.left?.lastDir ?? 0;
  let rightLastDir = initialHandState?.right?.lastDir ?? 0;

  for (const bar of windowBars) {
    const role = bar.musical_role || 'verse';
    const barIdx = bar.bar_index;

    for (const evt of bar.rhythmic_events) {
      const beat = evt.beat;
      const tag = evt.tag;
      const beatInBar = evt.beat_in_bar;

      let leftToken = null;
      let rightToken = null;

      if (role === 'build_up') {
        // Build-up section: Ascending ladder & staggered lanes (Vision-Block Safe)
        const progress = Math.min(1.0, (barIdx % 8) / 7);
        const targetLayer = progress > 0.6 ? 2 : (progress > 0.3 ? 1 : 0);

        if (tag === 'kick' || tag === 'snare') {
          // Inner lanes (x=1, x=2)
          const nextLeft = (leftLastDir === 1 || leftLastDir === 6 || leftLastDir === 7) ? 0 : 1;
          const nextRight = (rightLastDir === 1 || rightLastDir === 6 || rightLastDir === 7) ? 0 : 1;
          leftLastDir = nextLeft;
          rightLastDir = nextRight;

          leftToken = `R1${targetLayer}${nextLeft}`;
          rightToken = `B2${targetLayer}${nextRight}`;
        } else if (progress > 0.5 && tag === 'hat') {
          // Outer lanes (x=0, x=3) to prevent eye-level vision blocks
          if (beatInBar === 0.5 || beatInBar === 2.5) {
            const nextLeft = (leftLastDir === 1 || leftLastDir === 6 || leftLastDir === 7) ? 0 : 1;
            leftLastDir = nextLeft;
            leftToken = `R0${targetLayer === 2 ? 1 : 0}${nextLeft}`;
          } else if (beatInBar === 1.5 || beatInBar === 3.5) {
            const nextRight = (rightLastDir === 1 || rightLastDir === 6 || rightLastDir === 7) ? 0 : 1;
            rightLastDir = nextRight;
            rightToken = `B3${targetLayer === 2 ? 1 : 0}${nextRight}`;
          }
        }
      } else if (role === 'chorus_drop') {
        // High-energy Drop: Classic Beat Saber Alternating Stream
        // Left cuts on on-beats (0, 1, 2, 3), Right cuts on off-beats (0.5, 1.5, 2.5, 3.5)
        // Alternating Down -> Up with full 180-deg recoil
        if (tag === 'kick') {
          // Beat 0, 2: Left strikes Down
          leftLastDir = 1;
          leftToken = `R101`;
        } else if (tag === 'snare') {
          // Beat 1, 3: Left recoils Up
          leftLastDir = 0;
          leftToken = `R110`;
        } else if (tag === 'hat') {
          if (beatInBar === 0.5 || beatInBar === 2.5) {
            // Right strikes Down on off-beats
            rightLastDir = 1;
            rightToken = `B201`;
          } else if (beatInBar === 1.5 || beatInBar === 3.5) {
            // Right recoils Up on off-beats
            rightLastDir = 0;
            rightToken = `B210`;
          }
        }
      } else {
        // Verse / Intro / Outro: Flowing Natural Groove
        if (tag === 'kick') {
          const nextLeft = (leftLastDir === 1 || leftLastDir === 6 || leftLastDir === 7) ? 0 : 1;
          const nextRight = (rightLastDir === 1 || rightLastDir === 6 || rightLastDir === 7) ? 0 : 1;
          leftLastDir = nextLeft;
          rightLastDir = nextRight;
          leftToken = `R10${nextLeft}`;
          rightToken = `B20${nextRight}`;
        } else if (tag === 'snare') {
          const nextLeft = (leftLastDir === 1 || leftLastDir === 6 || leftLastDir === 7) ? 0 : 1;
          const nextRight = (rightLastDir === 1 || rightLastDir === 6 || rightLastDir === 7) ? 0 : 1;
          leftLastDir = nextLeft;
          rightLastDir = nextRight;
          leftToken = `R11${nextLeft}`;
          rightToken = `B21${nextRight}`;
        } else if (tag === 'hat' && evt.intensity > 0.35) {
          // Gentle Dot accent on outer lane / bottom layer (Vision-Block Safe)
          rightToken = `B308`;
        }
      }

      if (leftToken || rightToken) {
        const lStr = leftToken || '';
        const rStr = rightToken || '';
        if (rStr) {
          dslLines.push(`${beat}: ${lStr} | ${rStr}`);
        } else {
          dslLines.push(`${beat}: ${lStr}`);
        }
      }
    }
  }

  return {
    dslText: dslLines.join('\n'),
    finalHandState: {
      left: { lastDir: leftLastDir },
      right: { lastDir: rightLastDir }
    }
  };
}

/**
 * Processes long audio slots with Sliding Windows
 */
export async function processSlidingWindows(slotsData, options = {}) {
  const barsPerWindow = options.barsPerWindow || 8;
  const allBars = slotsData.bars || [];
  const totalBars = allBars.length;
  const numWindows = Math.ceil(totalBars / barsPerWindow);

  console.log(`[SlidingWindow] Processing ${totalBars} bars across ${numWindows} windows (Window size: ${barsPerWindow} bars)...`);

  const combinedDslLines = [];
  let currentHandState = null;

  for (let w = 0; w < numWindows; w++) {
    const startBar = w * barsPerWindow;
    const endBar = Math.min(totalBars, startBar + barsPerWindow);
    const windowBars = allBars.slice(startBar, endBar);

    console.log(`  -> Window ${w + 1}/${numWindows}: Bars ${startBar}..${endBar - 1} (${windowBars[0]?.musical_role || 'flow'})`);

    const result = choreographWindow(windowBars, currentHandState);
    if (result.dslText) {
      combinedDslLines.push(result.dslText);
    }
    currentHandState = result.finalHandState;
  }

  const fullDsl = combinedDslLines.join('\n');
  return fullDsl;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const slotsPath = path.resolve(__dirname, '../../dataset/slots_60s.json');
  const outPath = path.resolve(__dirname, '../../dataset/benchmark_60s.dsl');

  const slotsData = JSON.parse(fs.readFileSync(slotsPath, 'utf-8'));
  processSlidingWindows(slotsData, { barsPerWindow: 8 }).then(fullDsl => {
    fs.writeFileSync(outPath, fullDsl, 'utf-8');
    const lines = fullDsl.split('\n').filter(Boolean).length;
    console.log(`[SlidingWindow] Complete! Saved ${lines} lines to ${outPath}`);
  });
}
