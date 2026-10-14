import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateBenchmarkAudio } from './src/dsp/generate_synth_wav.js';
import { generate60sBenchmarkAudio } from './src/dsp/generate_60s_track.js';
import { extractSlotsFromAudio } from './src/dsp/extract_slots.js';
import { generateDsl } from './src/llm/generate_dsl.js';
import { processSlidingWindows } from './src/llm/sliding_window.js';
import { dslToBeatmap } from './src/transpiler/transpile.js';
import { lintBeatmap, autofixBeatmap } from './src/linter/assertion.js';
import { createServer } from './src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPipeline() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const isAkasaki = args.includes('--akasaki') || (!args.includes('--60s') && !args.includes('--15s')); // Default to real user song
  const is60s = !isAkasaki && args.includes('--60s');

  const modeTitle = isAkasaki ? 'AKASAKI - SHAKE NA BABY (2m 37s REAL TRACK)' : (is60s ? '60s PROGRESSIVE EDM' : '15s QUICK DEMO');

  console.log('='.repeat(70));
  console.log(`      BEATSABER-LLM-MAPPER : ${modeTitle}`);
  console.log('='.repeat(70));

  const datasetDir = path.resolve(__dirname, 'dataset');
  if (!fs.existsSync(datasetDir)) fs.mkdirSync(datasetDir, { recursive: true });

  let wavFilename = 'akasaki_shake.wav';
  let slotsPath = path.join(datasetDir, 'slots_akasaki.json');
  let dslPath = path.join(datasetDir, 'akasaki_shake.dsl');
  let datFilename = 'ExpertPlus_akasaki.dat';
  let infoFilename = 'info_akasaki.dat';
  let targetBpm = 135.0;

  if (!isAkasaki) {
    wavFilename = is60s ? 'benchmark_60s.wav' : 'sample_15s.wav';
    slotsPath = path.join(datasetDir, is60s ? 'slots_60s.json' : 'slots.json');
    dslPath = path.join(datasetDir, is60s ? 'benchmark_60s.dsl' : 'generated.dsl');
    datFilename = is60s ? 'ExpertPlus_60s.dat' : 'ExpertPlus.dat';
    infoFilename = is60s ? 'info_60s.dat' : 'info.dat';
    targetBpm = 128.0;
  }

  const wavPath = path.join(datasetDir, wavFilename);
  const datPath = path.join(datasetDir, datFilename);
  const infoPath = path.join(datasetDir, infoFilename);

  // -------------------------------------------------------------
  // Stage 1: DSP Feature Engineering & Audio Ingestion
  // -------------------------------------------------------------
  console.log('\n[Stage 1/5] DSP Audio Ingestion & Slot Extraction...');
  if (!fs.existsSync(wavPath)) {
    if (isAkasaki) {
      throw new Error(`Audio file not found: ${wavPath}`);
    } else {
      console.log(`  -> Synthesizing ${is60s ? '60s' : '15s'} reference benchmark audio (128 BPM)...`);
      if (is60s) generate60sBenchmarkAudio(wavPath);
      else generateBenchmarkAudio(wavPath);
    }
  } else {
    console.log(`  -> Found audio source: ${path.basename(wavPath)}`);
  }

  console.log(`  -> Extracting tempo, transient onsets and energy slots (${targetBpm} BPM)...`);
  const slotData = extractSlotsFromAudio(wavPath, targetBpm);
  fs.writeFileSync(slotsPath, JSON.stringify(slotData, null, 2), 'utf-8');
  console.log(`  -> Produced ${slotData.song_metadata.total_slots} time slots in ${slotData.song_metadata.total_bars} bars.`);

  // -------------------------------------------------------------
  // Stage 2: Kinematic Planning & BS-DSL Generation (Sliding Window)
  // -------------------------------------------------------------
  console.log('\n[Stage 2/5] Kinematic Movement Planning (BS-DSL)...');
  let dslText = '';
  if (isAkasaki || is60s) {
    dslText = await processSlidingWindows(slotData, { barsPerWindow: 8 });
    fs.writeFileSync(dslPath, dslText, 'utf-8');
  } else {
    dslText = await generateDsl({ slotsPath, outputPath: dslPath });
  }
  const dslLineCount = dslText.split('\n').filter(Boolean).length;
  console.log(`  -> Successfully generated ${dslLineCount} kinematic movement slots.`);

  // -------------------------------------------------------------
  // Stage 3: Transpilation to Official Beat Saber V2 Format
  // -------------------------------------------------------------
  console.log('\n[Stage 3/5] Transpiling BS-DSL to Official Beat Saber Map...');
  let beatmap = dslToBeatmap(dslText);
  console.log(`  -> Compiled ${beatmap._notes.length} notes.`);

  // -------------------------------------------------------------
  // Stage 4: Deterministic Kinematic Linter & Parity Guard
  // -------------------------------------------------------------
  console.log('\n[Stage 4/5] Running Kinematic Parity Linter & Safety Assertion...');
  let report = lintBeatmap(beatmap, targetBpm);
  console.log(`  -> Initial Parity Compliance: ${report.parity_rate_percent}%`);
  console.log(`  -> Physical Ergonomic Score:  ${report.overall_score}/100`);
  console.log(`  -> Vision Blocks:             ${report.vision_block_count}`);
  console.log(`  -> Double Direction Cuts:     ${report.double_direction_count}`);

  if (!report.is_valid || report.parity_rate_percent < 95.0) {
    console.log('  -> Parity violations detected. Applying deterministic autofix compiler pass...');
    const { fixedBeatmap, fixedCount } = autofixBeatmap(beatmap, targetBpm);
    beatmap = fixedBeatmap;
    report = lintBeatmap(beatmap, targetBpm);
    console.log(`  -> Autofix applied: ${fixedCount} adjustments. New Parity Compliance: ${report.parity_rate_percent}%`);
  }

  fs.writeFileSync(datPath, JSON.stringify(beatmap, null, 2), 'utf-8');
  console.log(`  -> Saved final compliant map: ${datPath}`);

  // Synchronize info.dat
  let songDisplayName = "AKASAKI - シャケナベイベー (Shake Na Baby)";
  let songFilenameForInfo = "akasaki_shake.ogg";
  let coverFilename = "akasaki_cover.jpg";

  if (!isAkasaki) {
    songDisplayName = is60s ? "EDM Progressive 60s Master" : "Sample 15s Benchmark";
    songFilenameForInfo = wavFilename;
    coverFilename = "";
  }

  const infoData = {
    _version: "2.0.0",
    _songName: songDisplayName,
    _songSubName: `Parity ${report.parity_rate_percent}% • Score ${report.overall_score}`,
    _songAuthorName: isAkasaki ? "AKASAKI" : "BeatSaber-LLM-Mapper",
    _levelAuthorName: "Neuro-Symbolic Copilot",
    _beatsPerMinute: targetBpm,
    _songTimeOffset: 0.0,
    _shuffle: 0,
    _shufflePeriod: 0.5,
    _previewStartTime: isAkasaki ? 60.0 : (is60s ? 30.0 : 0.0),
    _previewDuration: 15.0,
    _songFilename: songFilenameForInfo,
    _coverImageFilename: coverFilename,
    _environmentName: "DefaultEnvironment",
    _allDirectionsEnvironmentName: "GlassDesertEnvironment",
    _difficultyBeatmapSets: [
      {
        "_beatmapCharacteristicName": "Standard",
        "_difficultyBeatmaps": [
          {
            "_difficulty": "ExpertPlus",
            "_difficultyRank": 9,
            "_beatmapFilename": datFilename,
            "_noteJumpMovementSpeed": isAkasaki ? 16.0 : (is60s ? 15.0 : 14.0),
            "_noteJumpStartBeatOffset": 0.0
          }
        ]
      }
    ]
  };
  fs.writeFileSync(infoPath, JSON.stringify(infoData, null, 2), 'utf-8');

  // -------------------------------------------------------------
  // Stage 5: Web 3D Viewer Verification & Summary
  // -------------------------------------------------------------
  console.log('\n[Stage 5/5] Web 3D Viewer Ready!');
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('='.repeat(70));
  console.log(`✅ PIPELINE COMPLETE IN ${elapsed}s!`);
  console.log(`  - Track Mode:  ${modeTitle}`);
  console.log(`  - Audio:       dataset/${songFilenameForInfo}`);
  console.log(`  - Time Slots:  dataset/${path.basename(slotsPath)}`);
  console.log(`  - DSL Code:    dataset/${path.basename(dslPath)}`);
  console.log(`  - Map Output:  dataset/${datFilename} (${beatmap._notes.length} Notes)`);
  console.log(`  - Parity Rate: ${report.parity_rate_percent}% Ergonomic Compliance`);
  console.log(`  - Score:       ${report.overall_score}/100 Physical Safety`);
  console.log('='.repeat(70));

  if (args.includes('--serve')) {
    const server = createServer();
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      console.log(`\n🚀 Web 3D Viewer launched at: http://localhost:${port}/`);
      console.log('👉 Open your browser to test and play the 3D map live!');
    });
  } else {
    console.log('\nRun "npm run serve" to launch the Web 3D Viewer anytime.');
  }
}

runPipeline().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
