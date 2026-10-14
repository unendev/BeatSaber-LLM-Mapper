import os
import json
import numpy as np
import soundfile as sf
import librosa

# TRUE ACOUSTIC PARAMETERS:
# True BPM = 114.84 (standard 115 BPM)
# True First Beat Offset = 0.731s
TRUE_BPM = 114.84
BEAT_OFFSET = 0.7314

def extract_aligned_hologram(audio_path, output_json_path):
    print(f"=== [Hologram Realignment] Audio: {audio_path} ===")
    data, sr = sf.read(audio_path)
    if data.ndim == 1:
        data = np.stack([data, data], axis=-1)
    
    n_samples = data.shape[0]
    duration = n_samples / sr
    left_channel = data[:, 0]
    right_channel = data[:, 1]
    mono = np.mean(data, axis=-1)

    spb = 60.0 / TRUE_BPM  # ~0.52246s per beat
    print(f"Duration: {duration:.2f}s, True BPM: {TRUE_BPM}, Offset: {BEAT_OFFSET}s, SecondsPerBeat: {spb:.4f}s")

    # STFT & HPSS
    stft = librosa.stft(mono)
    stft_h, stft_p = librosa.decompose.hpss(stft, margin=1.2)
    freqs = librosa.fft_frequencies(sr=sr)
    frame_times = librosa.frames_to_time(np.arange(stft.shape[1]), sr=sr)

    sub_mask = (freqs >= 20) & (freqs < 140)
    mid_mask = (freqs >= 140) & (freqs < 2400)
    high_mask = (freqs >= 2400) & (freqs <= 16000)

    drums_e = np.mean(np.abs(stft_p), axis=0)
    bass_e = np.mean(np.abs(stft_h)[sub_mask, :], axis=0) if np.any(sub_mask) else np.zeros(stft.shape[1])
    vocal_e = np.mean(np.abs(stft_h)[mid_mask, :], axis=0) if np.any(mid_mask) else np.zeros(stft.shape[1])
    high_e = np.mean(np.abs(stft)[high_mask, :], axis=0) if np.any(high_mask) else np.zeros(stft.shape[1])

    def norm(a):
        m = np.max(a)
        return (a / m) if m > 1e-6 else a

    drums_norm = norm(drums_e)
    bass_norm = norm(bass_e)
    vocal_norm = norm(vocal_e)
    high_norm = norm(high_e)

    # YIN pitch
    f0 = librosa.yin(mono, fmin=80, fmax=800, sr=sr, frame_length=2048, hop_length=512)
    f0 = np.nan_to_num(f0, nan=0.0)
    pitch_times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=512)

    # Stereo Panning
    hop = 512
    flen = 2048
    n_f = int(np.ceil((len(mono) - flen) / hop)) + 1
    pan_prof = []
    pan_t = []
    for i in range(n_f):
        st = i * hop
        ed = min(n_samples, st + flen)
        if st >= n_samples: break
        l_rms = np.sqrt(np.mean(left_channel[st:ed] ** 2) + 1e-9)
        r_rms = np.sqrt(np.mean(right_channel[st:ed] ** 2) + 1e-9)
        pan_prof.append((r_rms - l_rms) / (r_rms + l_rms + 1e-6))
        pan_t.append(st / sr)
    pan_prof = np.array(pan_prof)
    pan_t = np.array(pan_t)

    # Construct strictly phase-locked beat grid:
    # Beat 0 is at BEAT_OFFSET
    total_beats = int(np.floor((duration - BEAT_OFFSET) / spb))
    beats_list = []

    for b_idx in range(total_beats):
        b_time = BEAT_OFFSET + b_idx * spb

        f_idx = min(len(frame_times) - 1, np.searchsorted(frame_times, b_time))
        d_val = float(drums_norm[f_idx])
        b_val = float(bass_norm[f_idx])
        v_val = float(vocal_norm[f_idx])
        h_val = float(high_norm[f_idx])

        tot_e = 0.35 * d_val + 0.25 * b_val + 0.30 * v_val + 0.10 * h_val

        p_idx = min(len(pitch_times) - 1, np.searchsorted(pitch_times, b_time))
        p_hz = float(f0[p_idx])
        prev_p = max(0, p_idx - 2)
        p_slope = float(f0[p_idx] - f0[prev_p]) if f0[p_idx] > 0 and f0[prev_p] > 0 else 0.0

        pn_idx = min(len(pan_t) - 1, np.searchsorted(pan_t, b_time))
        pan_val = float(pan_prof[pn_idx])

        beats_list.append({
            "beatIndex": b_idx,
            "time": round(b_time, 3),
            "energy": round(tot_e, 3),
            "stems": {
                "drums": round(d_val, 3),
                "bass": round(b_val, 3),
                "vocal": round(v_val, 3),
                "high": round(h_val, 3)
            },
            "pitchHz": round(p_hz, 1),
            "pitchSlope": round(p_slope, 2),
            "panning": round(pan_val, 2)
        })

    # Group into Bars
    total_bars = int(np.ceil(total_beats / 4.0))
    bars = []
    for bar_idx in range(total_bars):
        bar_beats = beats_list[bar_idx * 4 : min(total_beats, (bar_idx + 1) * 4)]
        if not bar_beats: continue

        avg_e = float(np.mean([b["energy"] for b in bar_beats]))
        avg_v = float(np.mean([b["stems"]["vocal"] for b in bar_beats]))
        avg_d = float(np.mean([b["stems"]["drums"] for b in bar_beats]))
        avg_b = float(np.mean([b["stems"]["bass"] for b in bar_beats]))
        avg_p = float(np.mean([b["panning"] for b in bar_beats]))

        dE = avg_e - bars[-1]["avgEnergy"] if (bar_idx > 0 and len(bars) > 0) else 0.0

        if avg_e > 0.34 or dE > 0.07:
            tension = "climax"
        elif avg_e > 0.25 or dE > 0.03:
            tension = "building"
        elif avg_e > 0.10:
            tension = "groove"
        else:
            tension = "chill"

        bars.append({
            "barIndex": bar_idx,
            "startTime": bar_beats[0]["time"],
            "endTime": round(bar_beats[-1]["time"] + spb, 3),
            "avgEnergy": round(avg_e, 3),
            "energyAcc": round(dE, 3),
            "tension": tension,
            "stemDominance": {
                "vocal": round(avg_v, 3),
                "drums": round(avg_d, 3),
                "bass": round(avg_b, 3)
            },
            "stereoSpread": round(avg_p, 2),
            "beats": bar_beats
        })

    out = {
        "metadata": {
            "source": audio_path,
            "bpm": round(TRUE_BPM, 2),
            "songTimeOffset": round(BEAT_OFFSET, 4),
            "duration": round(duration, 2),
            "totalBeats": total_beats,
            "totalBars": len(bars),
            "version": "2.0-Holographic-PhaseLocked"
        },
        "bars": bars
    }

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"Realigned Hologram Written: {len(bars)} bars, {total_beats} beats, BPM={TRUE_BPM}, Offset={BEAT_OFFSET}")

if __name__ == "__main__":
    extract_aligned_hologram("dataset/akasaki_shake.ogg", "dataset/hologram_akasaki.json")
