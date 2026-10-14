import os
import sys
import json
import numpy as np
import soundfile as sf
import librosa

def extract_hologram(audio_path, output_json_path, bpm_override=135.0):
    print(f"=== [Hologram Extractor] Loading audio: {audio_path} ===")
    
    data, sr = sf.read(audio_path)
    if data.ndim == 1:
        data = np.stack([data, data], axis=-1)
    
    n_samples = data.shape[0]
    duration = n_samples / sr
    left_channel = data[:, 0]
    right_channel = data[:, 1]
    mono = np.mean(data, axis=-1)

    tempo = float(bpm_override)
    print(f"Loaded: Duration={duration:.2f}s, SR={sr}, Using Musical BPM: {tempo}")

    print("Performing Harmonic-Percussive Source Separation (HPSS)...")
    stft = librosa.stft(mono)
    stft_harmonic, stft_percussive = librosa.decompose.hpss(stft, margin=1.2)
    
    freqs = librosa.fft_frequencies(sr=sr)
    sub_bass_mask = (freqs >= 20) & (freqs < 150)
    mid_mask = (freqs >= 150) & (freqs < 2500)
    high_mask = (freqs >= 2500) & (freqs <= 16000)

    mag_harmonic = np.abs(stft_harmonic)
    mag_percussive = np.abs(stft_percussive)
    mag_all = np.abs(stft)

    frame_times = librosa.frames_to_time(np.arange(stft.shape[1]), sr=sr)

    drums_energy = np.mean(mag_percussive, axis=0)
    bass_energy = np.mean(mag_harmonic[sub_bass_mask, :], axis=0) if np.any(sub_bass_mask) else np.zeros(stft.shape[1])
    vocal_energy = np.mean(mag_harmonic[mid_mask, :], axis=0) if np.any(mid_mask) else np.zeros(stft.shape[1])
    high_energy = np.mean(mag_all[high_mask, :], axis=0) if np.any(high_mask) else np.zeros(stft.shape[1])

    def normalize(arr):
        mx = np.max(arr)
        return (arr / mx) if mx > 1e-6 else arr

    drums_norm = normalize(drums_energy)
    bass_norm = normalize(bass_energy)
    vocal_norm = normalize(vocal_energy)
    high_norm = normalize(high_energy)

    print("Tracking Melodic Pitch Contour (yin)...")
    f0 = librosa.yin(mono, fmin=80, fmax=800, sr=sr, frame_length=2048, hop_length=512)
    f0 = np.nan_to_num(f0, nan=0.0)
    pitch_times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=512)

    print("Computing Stereo Panning Profile...")
    hop_length = 512
    frame_len = 2048
    n_frames = int(np.ceil((len(mono) - frame_len) / hop_length)) + 1
    
    pan_profile = []
    panning_times = []
    for i in range(max(0, n_frames)):
        start = i * hop_length
        end = min(n_samples, start + frame_len)
        if start >= n_samples:
            break
        l_rms = np.sqrt(np.mean(left_channel[start:end] ** 2) + 1e-9)
        r_rms = np.sqrt(np.mean(right_channel[start:end] ** 2) + 1e-9)
        pan = (r_rms - l_rms) / (r_rms + l_rms + 1e-6)
        pan_profile.append(float(pan))
        panning_times.append(start / sr)

    pan_profile = np.array(pan_profile)
    panning_times = np.array(panning_times)

    print("Aggregating into Musical Bars & Beats Hologram...")
    spb = 60.0 / tempo
    total_beats = int(np.floor(duration / spb))
    
    bars = []
    beats_list = []
    
    for b_idx in range(total_beats):
        b_start = b_idx * spb
        b_end = (b_idx + 1) * spb
        b_mid = (b_start + b_end) / 2.0

        f_idx = min(len(frame_times) - 1, np.searchsorted(frame_times, b_mid))
        d_val = float(drums_norm[f_idx])
        b_val = float(bass_norm[f_idx])
        v_val = float(vocal_norm[f_idx])
        h_val = float(high_norm[f_idx])
        
        total_e = 0.35 * d_val + 0.25 * b_val + 0.30 * v_val + 0.10 * h_val

        p_idx = min(len(pitch_times) - 1, np.searchsorted(pitch_times, b_mid))
        pitch_hz = float(f0[p_idx])
        
        prev_p_idx = max(0, p_idx - 2)
        pitch_slope = float(f0[p_idx] - f0[prev_p_idx]) if f0[p_idx] > 0 and f0[prev_p_idx] > 0 else 0.0

        pan_idx = min(len(panning_times) - 1, np.searchsorted(panning_times, b_mid))
        pan_val = float(pan_profile[pan_idx])

        stem_scores = {"drums": d_val, "bass": b_val, "vocal": v_val, "high": h_val}
        dominant_stem = max(stem_scores, key=stem_scores.get)

        beat_info = {
            "beatIndex": b_idx,
            "time": round(b_start, 3),
            "energy": round(total_e, 3),
            "stems": {
                "drums": round(d_val, 3),
                "bass": round(b_val, 3),
                "vocal": round(v_val, 3),
                "high": round(h_val, 3)
            },
            "dominantStem": dominant_stem,
            "pitchHz": round(pitch_hz, 1),
            "pitchSlope": round(pitch_slope, 2),
            "panning": round(pan_val, 2)
        }
        beats_list.append(beat_info)

    total_bars = int(np.ceil(total_beats / 4.0))
    for bar_idx in range(total_bars):
        bar_beats = beats_list[bar_idx * 4 : min(total_beats, (bar_idx + 1) * 4)]
        if not bar_beats:
            continue
        
        avg_energy = float(np.mean([b["energy"] for b in bar_beats]))
        avg_vocal = float(np.mean([b["stems"]["vocal"] for b in bar_beats]))
        avg_drums = float(np.mean([b["stems"]["drums"] for b in bar_beats]))
        avg_bass = float(np.mean([b["stems"]["bass"] for b in bar_beats]))
        avg_pan = float(np.mean([b["panning"] for b in bar_beats]))

        if bar_idx > 0 and len(bars) > 0:
            dE = avg_energy - bars[-1]["avgEnergy"]
        else:
            dE = 0.0

        if avg_energy > 0.50 or dE > 0.18:
            tension_level = "climax"
        elif avg_energy > 0.30 or dE > 0.08:
            tension_level = "building"
        elif avg_energy > 0.15:
            tension_level = "groove"
        else:
            tension_level = "chill"

        bars.append({
            "barIndex": bar_idx,
            "startTime": bar_beats[0]["time"],
            "endTime": round(bar_beats[-1]["time"] + spb, 3),
            "avgEnergy": round(avg_energy, 3),
            "energyAcc": round(dE, 3),
            "tension": tension_level,
            "stemDominance": {
                "vocal": round(avg_vocal, 3),
                "drums": round(avg_drums, 3),
                "bass": round(avg_bass, 3)
            },
            "stereoSpread": round(avg_pan, 2),
            "beats": bar_beats
        })

    hologram_data = {
        "metadata": {
            "source": audio_path,
            "bpm": round(tempo, 2),
            "duration": round(duration, 2),
            "totalBeats": total_beats,
            "totalBars": len(bars),
            "version": "2.0-Holographic"
        },
        "bars": bars
    }

    print(f"Writing hologram JSON to: {output_json_path} ...")
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(hologram_data, f, indent=2, ensure_ascii=False)

    print(f"=== Hologram Extracted Successfully! Bars: {len(bars)}, Beats: {total_beats} at BPM {tempo} ===")

if __name__ == "__main__":
    audio_file = os.path.join("dataset", "akasaki_shake.ogg")
    output_file = os.path.join("dataset", "hologram_akasaki.json")
    bpm = 135.0
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    if len(sys.argv) > 3:
        bpm = float(sys.argv[3])
    extract_hologram(audio_file, output_file, bpm)
