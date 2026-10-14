import os
import sys
import yaml

# Direction Constants:
# 0: Up, 1: Down, 2: Left, 3: Right
# 4: Up-Left, 5: Up-Right, 6: Down-Left, 7: Down-Right, 8: Dot
DOWN_DIRS = [1, 6, 7]
UP_DIRS = [0, 4, 5]

def get_natural_recoil(last_dir, bias="straight"):
    """Ensures 100% strict kinematic parity alternation without awkward wrist twists."""
    if last_dir in DOWN_DIRS:
        if bias == "outward_left":
            return 4 # Up-Left
        elif bias == "outward_right":
            return 5 # Up-Right
        return 0 # Up
    else:
        if bias == "outward_left":
            return 6 # Down-Left
        elif bias == "outward_right":
            return 7 # Down-Right
        return 1 # Down

def choreograph_hologram(yaml_path, output_dsl_path):
    with open(yaml_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    bars = data.get("bars", [])
    dsl_lines = []

    # Dynamic Kinematic State
    left_last_dir = 0   # ready to swing down
    right_last_dir = 0  # ready to swing down

    for bar in bars:
        bar_idx = bar["bar"]
        tension = bar["tension"]
        pan = bar.get("pan", 0.0)
        events = bar.get("events", [])

        # Motif / Choreography style per tension
        is_climax = (tension == "climax")
        is_building = (tension == "building")
        is_chill = (tension == "chill")

        for evt in events:
            beat = evt["beat"]
            b_in_bar = evt["beat_in_bar"]
            role = evt["role"]
            energy = evt["energy"]
            p_hz = evt["pitch_hz"]
            p_slope = evt["pitch_slope"]
            sugg_layer = evt["suggested_layer"]
            field_bias = evt["field_bias"]

            left_token = None
            right_token = None

            # Chill section: selective notes to rest player
            if is_chill and energy < 0.08 and b_in_bar not in [0, 2]:
                continue

            # Layer allocation from continuous pitch
            if sugg_layer == 2 or p_slope > 30:
                y = 2
            elif sugg_layer == 1 or p_slope > -20:
                y = 1
            else:
                y = 0

            # Lateral space allocation (respecting stereo field & preventing arm lock)
            if field_bias == "LeftWide":
                lx = 0
                rx = 2
            elif field_bias == "RightWide":
                lx = 1
                rx = 3
            else:
                lx = 1
                rx = 2

            # Section Choreography Logic:
            if is_climax:
                # CLIMAX (Drop / Chorus): Expansive high-energy swings, full dynamic range
                if role == "DownbeatKick":
                    # Powerful synchronized double-strike
                    next_l = get_natural_recoil(left_last_dir, bias="outward_left")
                    next_r = get_natural_recoil(right_last_dir, bias="outward_right")
                    left_last_dir = next_l
                    right_last_dir = next_r
                    left_token = f"R{lx}{y}{next_l}"
                    right_token = f"B{rx}{y}{next_r}"
                elif role == "BackbeatSnare":
                    # Outward explosive sweep
                    next_l = get_natural_recoil(left_last_dir, bias="outward_left")
                    next_r = get_natural_recoil(right_last_dir, bias="outward_right")
                    left_last_dir = next_l
                    right_last_dir = next_r
                    left_token = f"R{lx}{1}{next_l}"
                    right_token = f"B{rx}{1}{next_r}"
                elif role == "VocalSyllable":
                    # Melody lead with alternating body flow
                    # Alternate leading hand based on beat
                    if b_in_bar % 2 == 0:
                        next_r = get_natural_recoil(right_last_dir, bias="outward_right" if y==2 else "straight")
                        right_last_dir = next_r
                        right_token = f"B{rx}{y}{next_r}"
                    else:
                        next_l = get_natural_recoil(left_last_dir, bias="outward_left" if y==2 else "straight")
                        left_last_dir = next_l
                        left_token = f"R{lx}{y}{next_l}"
                elif role == "HiHatSyncopation" and energy > 0.3:
                    # Off-beat syncopated dot or quick cut
                    right_token = f"B3{y}8"

            elif is_building:
                # BUILDING: Ascending ladder, rhythmic anticipation
                if role in ["DownbeatKick", "BackbeatSnare"]:
                    # Alternating hands on beats to create accelerating footwork
                    if b_in_bar in [0, 2]:
                        next_l = get_natural_recoil(left_last_dir, bias="straight")
                        left_last_dir = next_l
                        left_token = f"R{lx}{y}{next_l}"
                    else:
                        next_r = get_natural_recoil(right_last_dir, bias="straight")
                        right_last_dir = next_r
                        right_token = f"B{rx}{y}{next_r}"
                elif role == "VocalSyllable":
                    # Follow vocal climb
                    next_r = get_natural_recoil(right_last_dir, bias="straight")
                    right_last_dir = next_r
                    right_token = f"B{rx}{y}{next_r}"

            elif is_chill:
                # CHILL: Gentle single-handed navigation
                if role in ["DownbeatKick", "VocalSyllable"]:
                    next_r = get_natural_recoil(right_last_dir, bias="straight")
                    right_last_dir = next_r
                    right_token = f"B2{y}{next_r}"

            else:
                # GROOVE (Verse): Balanced rhythm foundation
                if role == "DownbeatKick":
                    next_l = get_natural_recoil(left_last_dir, bias="straight")
                    left_last_dir = next_l
                    left_token = f"R{lx}0{next_l}"
                elif role == "BackbeatSnare":
                    next_r = get_natural_recoil(right_last_dir, bias="straight")
                    right_last_dir = next_r
                    right_token = f"B{rx}1{next_r}"
                elif role == "VocalSyllable":
                    # Subtle melodic accents
                    next_r = get_natural_recoil(right_last_dir, bias="outward_right" if y==2 else "straight")
                    right_last_dir = next_r
                    right_token = f"B{rx}{y}{next_r}"
                elif role == "HiHatSyncopation" and energy > 0.35:
                    right_token = f"B308"

            # Format DSL output line
            if left_token and right_token:
                dsl_lines.append(f"{beat}: {left_token} | {right_token}")
            elif left_token:
                dsl_lines.append(f"{beat}: {left_token}")
            elif right_token:
                dsl_lines.append(f"{beat}:  | {right_token}")

    print(f"Hologram Choreography finished: {len(dsl_lines)} notes generated.")
    with open(output_dsl_path, "w", encoding="utf-8") as f:
        f.write("\n".join(dsl_lines) + "\n")
    print(f"Saved to: {output_dsl_path}")

if __name__ == "__main__":
    choreograph_hologram("dataset/music_semantic_akasaki.yaml", "dataset/akasaki_hologram.dsl")
