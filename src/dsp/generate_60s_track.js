import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_RATE = 44100;
const DURATION_SEC = 60.0; // 1 full minute
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC);
const BPM = 128.0;
const SECONDS_PER_BEAT = 60.0 / BPM; // 0.46875s
const TOTAL_BEATS = Math.floor(DURATION_SEC / SECONDS_PER_BEAT); // 128 beats = 32 bars

function createWavHeader(numSamples, sampleRate = 44100, numChannels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

export function generate60sBenchmarkAudio(outputPath) {
  console.log(`[DSP-Synth] Synthesizing 60s EDM Progressive Benchmark (${TOTAL_BEATS} beats, 32 bars)...`);
  const samples = new Float32Array(TOTAL_SAMPLES);

  for (let beat = 0; beat < TOTAL_BEATS; beat++) {
    const beatTime = beat * SECONDS_PER_BEAT;
    const beatSample = Math.floor(beatTime * SAMPLE_RATE);
    const barIdx = Math.floor(beat / 4); // 0..31
    const beatInBar = beat % 4;

    // Musical structure:
    // Bars 0-7: Intro (Beats 0-31)
    // Bars 8-15: Build-up (Beats 32-63)
    // Bars 16-23: Drop / Chorus (Beats 64-95)
    // Bars 24-31: Outro / Cooldown (Beats 96-127)
    const isIntro = barIdx < 8;
    const isBuildUp = barIdx >= 8 && barIdx < 16;
    const isDrop = barIdx >= 16 && barIdx < 24;
    const isOutro = barIdx >= 24;

    // 1. Kick Drum
    const shouldKick = isDrop || isIntro || isOutro || (isBuildUp && barIdx < 12);
    if (shouldKick) {
      const kickLen = Math.floor(0.26 * SAMPLE_RATE);
      const intensity = isDrop ? 0.95 : 0.75;
      for (let i = 0; i < kickLen && beatSample + i < TOTAL_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const freq = 45 + 130 * Math.exp(-t * 26);
        const env = Math.exp(-t * 15);
        samples[beatSample + i] += Math.sin(2 * Math.PI * freq * t) * env * intensity;
      }
    }

    // 2. Snare / Snare Roll (Build-up acceleration)
    if (isBuildUp) {
      // Snare roll speeds up: bars 8-11 every 2 beats, 12-13 every beat, 14-15 every 1/2 beat
      let rollSub = 1;
      if (barIdx >= 14) rollSub = 2; // double time roll
      for (let s = 0; s < rollSub; s++) {
        const snareTime = beatTime + s * (SECONDS_PER_BEAT / rollSub);
        const snareSample = Math.floor(snareTime * SAMPLE_RATE);
        const snareLen = Math.floor(0.18 * SAMPLE_RATE);
        for (let i = 0; i < snareLen && snareSample + i < TOTAL_SAMPLES; i++) {
          const t = i / SAMPLE_RATE;
          const noise = (Math.random() * 2 - 1) * Math.exp(-t * 18);
          samples[snareSample + i] += noise * 0.55;
        }
      }
    } else if (beatInBar === 1 || beatInBar === 3) {
      // Standard Backbeat snare
      const snareLen = Math.floor(0.22 * SAMPLE_RATE);
      for (let i = 0; i < snareLen && beatSample + i < TOTAL_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 22);
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 16);
        samples[beatSample + i] += (tone * 0.3 + noise * 0.7) * (isDrop ? 0.75 : 0.5);
      }
    }

    // 3. Hi-Hats
    for (let sub = 0; sub < 4; sub++) {
      const subTime = beatTime + sub * (SECONDS_PER_BEAT / 4);
      const subSample = Math.floor(subTime * SAMPLE_RATE);
      const isOff = (sub === 2);
      const hatLen = Math.floor((isOff ? 0.07 : 0.035) * SAMPLE_RATE);
      const hatVol = isDrop ? (isOff ? 0.35 : 0.18) : (isOff ? 0.25 : 0.1);
      for (let i = 0; i < hatLen && subSample + i < TOTAL_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 55);
        samples[subSample + i] += noise * hatVol;
      }
    }

    // 4. Synth Lead & Bass
    if (isDrop) {
      // Aggressive saw lead
      const melodyFreqs = [220, 246.9, 261.6, 293.6, 329.6, 349.2, 392.0];
      const freq = melodyFreqs[(beat * 3) % melodyFreqs.length];
      const leadLen = Math.floor(0.4 * SAMPLE_RATE);
      for (let i = 0; i < leadLen && beatSample + i < TOTAL_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const saw = 2 * ((freq * t) % 1) - 1;
        const env = Math.exp(-t * 8);
        samples[beatSample + i] += saw * env * 0.22;
      }
    }
  }

  // Soft limit and convert to 16-bit PCM buffer
  const pcmBuffer = Buffer.alloc(TOTAL_SAMPLES * 2);
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    let s = Math.max(-1.0, Math.min(1.0, samples[i]));
    const intSample = Math.floor(s < 0 ? s * 32768 : s * 32767);
    pcmBuffer.writeInt16LE(intSample, i * 2);
  }

  const header = createWavHeader(TOTAL_SAMPLES, SAMPLE_RATE, 1, 16);
  const fullBuffer = Buffer.concat([header, pcmBuffer]);
  fs.writeFileSync(outputPath, fullBuffer);
  console.log(`[DSP-Synth] Synthesized ${DURATION_SEC}s EDM benchmark -> ${outputPath} (${(fullBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = path.resolve(__dirname, '../../dataset/benchmark_60s.wav');
  generate60sBenchmarkAudio(target);
}
