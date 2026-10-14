import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Audio parameters
const SAMPLE_RATE = 44100;
const DURATION_SEC = 15.0;
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC);
const BPM = 128.0;
const SECONDS_PER_BEAT = 60.0 / BPM; // 0.46875s

function createWavHeader(numSamples, sampleRate = 44100, numChannels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

export function generateBenchmarkAudio(outputPath) {
  const samples = new Float32Array(TOTAL_SAMPLES);

  const totalBeats = Math.floor(DURATION_SEC / SECONDS_PER_BEAT); // 32 beats

  for (let beat = 0; beat < totalBeats; beat++) {
    const beatTime = beat * SECONDS_PER_BEAT;
    const beatSample = Math.floor(beatTime * SAMPLE_RATE);
    const beatInBar = beat % 4; // 0, 1, 2, 3

    // 1. Kick on every quarter beat (Four-on-the-floor: beats 0, 1, 2, 3)
    const kickLen = Math.floor(0.28 * SAMPLE_RATE);
    for (let i = 0; i < kickLen && beatSample + i < TOTAL_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const freq = 50 + 110 * Math.exp(-t * 22); // Pitch sweep
      const env = Math.exp(-t * 14);
      const val = Math.sin(2 * Math.PI * freq * t) * env * 0.75;
      samples[beatSample + i] += val;
    }

    // 2. Snare on beats 1 and 3 (Backbeat)
    if (beatInBar === 1 || beatInBar === 3) {
      const snareLen = Math.floor(0.22 * SAMPLE_RATE);
      for (let i = 0; i < snareLen && beatSample + i < TOTAL_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const tone = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 20);
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 16);
        const val = (tone * 0.35 + noise * 0.65) * 0.65;
        samples[beatSample + i] += val;
      }
    }

    // 3. Hi-Hats on 1/2 beats (off-beats) & 1/4 beats
    for (let sub = 0; sub < 4; sub++) {
      const subTime = beatTime + sub * (SECONDS_PER_BEAT / 4);
      const subSample = Math.floor(subTime * SAMPLE_RATE);
      const isOffbeat = (sub === 2);
      const hatLen = Math.floor((isOffbeat ? 0.08 : 0.04) * SAMPLE_RATE);
      const hatVol = isOffbeat ? 0.35 : 0.18;

      for (let i = 0; i < hatLen && subSample + i < TOTAL_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 60);
        samples[subSample + i] += noise * hatVol;
      }
    }

    // 4. Synth Bass pulse on offbeats
    const bassTime = beatTime + (SECONDS_PER_BEAT / 2);
    const bassSample = Math.floor(bassTime * SAMPLE_RATE);
    const bassLen = Math.floor(0.2 * SAMPLE_RATE);
    const bassFreq = beat < 16 ? 55.0 : 65.4; // A1 -> C2
    for (let i = 0; i < bassLen && bassSample + i < TOTAL_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const saw = 2 * ((bassFreq * t) % 1) - 1;
      const env = Math.exp(-t * 10);
      samples[bassSample + i] += saw * env * 0.28;
    }
  }

  // Convert Float32 (-1.0 to 1.0) to 16-bit PCM buffer
  const pcmBuffer = Buffer.alloc(TOTAL_SAMPLES * 2);
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    // Soft clip
    let s = Math.max(-1.0, Math.min(1.0, samples[i]));
    const intSample = Math.floor(s < 0 ? s * 32768 : s * 32767);
    pcmBuffer.writeInt16LE(intSample, i * 2);
  }

  const header = createWavHeader(TOTAL_SAMPLES, SAMPLE_RATE, 1, 16);
  const fullBuffer = Buffer.concat([header, pcmBuffer]);

  fs.writeFileSync(outputPath, fullBuffer);
  console.log(`[DSP-Synth] Synthesized ${DURATION_SEC}s audio -> ${outputPath} (${(fullBuffer.length / 1024).toFixed(1)} KB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = path.resolve(__dirname, '../../dataset/sample_15s.wav');
  generateBenchmarkAudio(target);
}
