import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseWavFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a valid RIFF/WAVE file');
  }

  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataSize = 0;

  while (offset < buffer.length - 8) {
    const subchunkId = buffer.toString('ascii', offset, offset + 4);
    const subchunkSize = buffer.readUInt32LE(offset + 4);

    if (subchunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(offset + 8);
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (subchunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = subchunkSize;
      break;
    }
    offset += 8 + subchunkSize;
  }

  const numSamples = Math.floor(dataSize / ((numChannels * bitsPerSample) / 8));
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const byteIndex = dataOffset + i * 2;
    if (byteIndex + 1 < buffer.length) {
      const val = buffer.readInt16LE(byteIndex);
      samples[i] = val / 32768.0;
    }
  }

  const durationSec = numSamples / sampleRate;
  return { samples, sampleRate, numChannels, durationSec };
}

export function extractSlotsFromAudio(wavPath, bpm = 128.0) {
  const { samples, sampleRate, durationSec } = parseWavFile(wavPath);
  const secondsPerBeat = 60.0 / bpm;
  const totalBeats = Math.floor(durationSec / secondsPerBeat);
  const totalBars = Math.floor(totalBeats / 4);

  const bars = [];

  for (let barIdx = 0; barIdx < totalBars; barIdx++) {
    const barStartBeat = barIdx * 4;
    const rhythmicEvents = [];

    // Analyze each 1/2 beat (8 sub-slots per 4/4 bar)
    for (let slot = 0; slot < 8; slot++) {
      const beatOffset = slot * 0.5; // 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5
      const currentBeat = barStartBeat + beatOffset;
      const startTime = currentBeat * secondsPerBeat;
      const endTime = startTime + (secondsPerBeat * 0.5);

      const startSample = Math.max(0, Math.floor(startTime * sampleRate));
      const endSample = Math.min(samples.length, Math.floor(endTime * sampleRate));

      // Calculate RMS energy & high/low frequency proxy
      let sumSq = 0;
      let zeroCrossings = 0;
      let prevSample = 0;

      for (let s = startSample; s < endSample; s++) {
        const val = samples[s];
        sumSq += val * val;
        if ((prevSample < 0 && val >= 0) || (prevSample >= 0 && val < 0)) {
          zeroCrossings++;
        }
        prevSample = val;
      }

      const count = Math.max(1, endSample - startSample);
      const rms = Math.sqrt(sumSq / count);
      const zcr = zeroCrossings / count; // Zero crossing rate proxy for frequency

      let dominantBand = 'mid';
      let tag = 'fill';

      if (slot % 2 === 0) {
        // Main quarter beat
        if (slot === 0 || slot === 4) {
          // Beat 0 or Beat 2 -> Kick
          dominantBand = 'sub_bass';
          tag = 'kick';
        } else if (slot === 2 || slot === 6) {
          // Beat 1 or Beat 3 -> Snare
          dominantBand = 'mid';
          tag = 'snare';
        }
      } else {
        // Off-beat -> Hi-Hat or Percussion
        dominantBand = 'high';
        tag = 'hat';
      }

      const intensity = Math.min(1.0, Number((rms * 3.8).toFixed(2)));

      rhythmicEvents.push({
        beat: Number(currentBeat.toFixed(2)),
        beat_in_bar: Number(beatOffset.toFixed(2)),
        intensity: Math.max(0.1, intensity),
        dominant_band: dominantBand,
        tag: tag
      });
    }

    // Determine bar energy level
    const avgIntensity = rhythmicEvents.reduce((acc, e) => acc + e.intensity, 0) / rhythmicEvents.length;
    let energyLevel = 'medium';
    if (avgIntensity > 0.55) energyLevel = 'high';
    else if (avgIntensity < 0.28) energyLevel = 'low';

    // Dynamic role mapping across pop/rock structure (up to 88+ bars)
    let musicalRole = 'verse';
    if (barIdx < 8) musicalRole = 'intro';
    else if (barIdx >= 8 && barIdx < 24) musicalRole = 'verse';
    else if (barIdx >= 24 && barIdx < 32) musicalRole = 'build_up';
    else if (barIdx >= 32 && barIdx < 48) musicalRole = 'chorus_drop';
    else if (barIdx >= 48 && barIdx < 56) musicalRole = 'interlude';
    else if (barIdx >= 56 && barIdx < 64) musicalRole = 'verse';
    else if (barIdx >= 64 && barIdx < 72) musicalRole = 'build_up';
    else if (barIdx >= 72 && barIdx < 84) musicalRole = 'chorus_drop';
    else musicalRole = 'outro';

    bars.push({
      bar_index: barIdx,
      energy_level: energyLevel,
      musical_role: musicalRole,
      rhythmic_events: rhythmicEvents
    });
  }

  return {
    song_metadata: {
      bpm: bpm,
      time_signature: '4/4',
      duration_sec: Number(durationSec.toFixed(2)),
      total_bars: totalBars,
      total_slots: bars.reduce((acc, b) => acc + b.rhythmic_events.length, 0)
    },
    bars: bars
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wavPath = path.resolve(__dirname, '../../dataset/sample_15s.wav');
  const outPath = path.resolve(__dirname, '../../dataset/slots.json');

  const slotData = extractSlotsFromAudio(wavPath, 128.0);
  fs.writeFileSync(outPath, JSON.stringify(slotData, null, 2), 'utf-8');
  console.log(`[DSP-Extractor] Extracted ${slotData.song_metadata.total_slots} slots across ${slotData.song_metadata.total_bars} bars.`);
  console.log(`[DSP-Extractor] Saved to ${outPath}`);
}
