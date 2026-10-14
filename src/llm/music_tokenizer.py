import os
import sys
import json
import yaml

def tokenize_hologram(hologram_path, output_yaml_path):
    with open(hologram_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    meta = data.get("metadata", {})
    bars = data.get("bars", [])

    tokenized_bars = []

    for bar in bars:
        b_idx = bar["barIndex"]
        avg_e = bar["avgEnergy"]
        dE = bar["energyAcc"]
        pan = bar.get("stereoSpread", 0.0)

        # Dynamic Tension Classification tuned for J-Pop/Rock
        # AKASAKI Shake Na Baby peaks around avg_e 0.38 - 0.45
        if avg_e > 0.36 or dE > 0.08:
            tension = "climax"
            narrative = "Peak chorus/drop: Full-body dance swing, cross-diagonal arcs, high vertical dynamics."
        elif avg_e > 0.28 or dE > 0.04:
            tension = "building"
            narrative = "Building tension: Accelerating rhythm, active vocal pitch tracing, rising elevation."
        elif avg_e > 0.12:
            tension = "groove"
            narrative = "Rhythmic verse groove: Alternating kick/bass foundation with vocal melodic accents."
        else:
            tension = "chill"
            narrative = "Chill intro/break: Relaxed sparse guidance, restoring stamina."

        events = []
        for beat in bar["beats"]:
            b_num = beat["beatIndex"]
            b_in_bar = b_num % 4
            energy = beat["energy"]
            stems = beat["stems"]
            d_e = stems["drums"]
            b_e = stems["bass"]
            v_e = stems["vocal"]
            h_e = stems["high"]
            p_hz = beat["pitchHz"]
            p_slope = beat["pitchSlope"]
            b_pan = beat["panning"]

            # Holographic Height Mapping
            if p_hz > 220 or p_slope > 30:
                suggested_layer = 2
            elif p_hz > 110:
                suggested_layer = 1
            else:
                suggested_layer = 0

            # Stereo Panning Bias
            if b_pan < -0.15:
                field_bias = "LeftWide"
            elif b_pan > 0.15:
                field_bias = "RightWide"
            else:
                field_bias = "Center"

            # Polymorphic Musical Roles
            # If drums or bass has significant punch, assign rhythmic anchor
            if (b_in_bar == 0 or b_in_bar == 2) and (d_e > 0.20 or b_e > 0.25):
                role = "DownbeatKick"
            elif (b_in_bar == 1 or b_in_bar == 3) and (d_e > 0.20 or h_e > 0.35):
                role = "BackbeatSnare"
            elif v_e > 0.25:
                role = "VocalSyllable"
            elif b_e > 0.20:
                role = "BassAnchor"
            else:
                role = "HiHatSyncopation"

            events.append({
                "beat": round(b_num * 1.0, 1),
                "beat_in_bar": b_in_bar,
                "role": role,
                "energy": round(energy, 2),
                "stems": {
                    "drums": round(d_e, 2),
                    "bass": round(b_e, 2),
                    "vocal": round(v_e, 2),
                    "high": round(h_e, 2)
                },
                "pitch_hz": round(p_hz, 1),
                "pitch_slope": round(p_slope, 1),
                "suggested_layer": suggested_layer,
                "field_bias": field_bias
            })

        tokenized_bars.append({
            "bar": b_idx,
            "tension": tension,
            "energy": round(avg_e, 2),
            "energy_acc": round(dE, 2),
            "pan": round(pan, 2),
            "narrative": narrative,
            "events": events
        })

    full_structure = {
        "metadata": {
            "bpm": meta.get("bpm", 135),
            "total_bars": len(bars),
            "song": meta.get("source", "akasaki_shake.ogg")
        },
        "bars": tokenized_bars
    }

    with open(output_yaml_path, "w", encoding="utf-8") as f:
        yaml.dump(full_structure, f, sort_keys=False, allow_unicode=True)

    print(f"Tokenized {len(tokenized_bars)} bars into {output_yaml_path}")

if __name__ == "__main__":
    inp = "dataset/hologram_akasaki.json"
    out = "dataset/music_semantic_akasaki.yaml"
    tokenize_hologram(inp, out)
