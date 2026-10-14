import os
import sys
import json
import re
import urllib.request

URL = "http://127.0.0.1:7860/v1/chat/completions"
HEADERS = {"Content-Type": "application/json", "Authorization": "Bearer 123456"}
MODEL = "gemini-3.8-flash"

SYSTEM_PROMPT = """你是一名世界顶级 Beat Saber (节奏光剑) 谱师与运动学编舞大师 (BennyDaBeast 级别)。
你正在为热血 J-Rock 歌曲《AKASAKI - Shake Na Baby》编排全曲 Expert+ 难度的高能谱面。

### 核心编舞原则
1. **极致跟人声与主副歌呼吸感 (Vocal & Hook Priority)**：
   - 只要歌手开口发音、转音撕扯，必须有清晰的方块击打，让玩家感到“双手如同在舞台上随着主唱歌唱”！
   - 低音底鼓轰炸时（Downbeat），配合双手下劈或对角大开大合；
   - 音乐爆发（climax）时，展开连续顺畅的交替流（Alternating Stream）；
   - 留白蓄力（chill）时，采用单手轻点或舒展引导。

2. **BS-DSL 纯净语法规范**：
   单行输出格式：`[Beat]: [LeftRed] | [RightBlue]`
   Token: `[Hand][X][Y][Dir]`
   - Hand: `R`(红方块/左手, 只能用 X=0, 1), `B`(蓝方块/右手, 只能用 X=2, 3)
   - X (列): 0(最左), 1(中偏左), 2(中偏右), 3(最右)
   - Y (高度): 0(下层), 1(中层), 2(上层)
   - Dir (方向): 0:上, 1:下, 2:左, 3:右, 4:左上, 5:右上, 6:左下, 7:右下, 8:点(Dot)

3. **严格人体工学与安全底线 (零骨折)**：
   - **严格遵守动量回摆 (Parity)**：下砍 (1, 6, 7) 后，下一击该手必须是上砍 (0, 4, 5) 或点 (8)！严禁同向连续强砍！
   - **严禁双臂死锁**：同一拍如果双手同时出现，红色 X 严禁大于蓝色 X (红只能在蓝的左侧)。
   - **严禁同拍同位重叠冲突**。

### 输出契约
请只在 ```bs-dsl ... ``` 代码块中输出纯净的 DSL 动作行，严禁输出任何额外闲聊或说明文字。
"""

def call_gemini(user_content):
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.6,
        "max_tokens": 4096
    }
    req = urllib.request.Request(URL, data=json.dumps(payload).encode("utf-8"), headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res["choices"][0]["message"]["content"]

def parse_dsl(raw_text):
    match = re.search(r"```(?:bs-dsl)?(.*?)```", raw_text, re.DOTALL)
    text = match.group(1).strip() if match else raw_text.strip()
    valid_lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"): continue
        if ":" in line and ("R" in line or "B" in line):
            valid_lines.append(line)
    return valid_lines

def generate_full_song():
    with open("dataset/hologram_akasaki.json", "r", encoding="utf-8") as f:
        holo = json.load(f)

    bars = holo["bars"]
    total_bars = len(bars)
    chunk_size = 8 # 8 bars per sliding window (~16.7 seconds)
    
    all_dsl_lines = []
    last_hand_state = "左手准备下砍，右手准备下砍"

    print(f"=== Starting Full Song Generation across {total_bars} Bars using {MODEL} ===")

    for i in range(0, total_bars, chunk_size):
        chunk_bars = bars[i : min(i + chunk_size, total_bars)]
        chunk_idx = (i // chunk_size) + 1
        st_beat = chunk_bars[0]["barIndex"] * 4
        ed_beat = (chunk_bars[-1]["barIndex"] + 1) * 4
        st_time = chunk_bars[0]["startTime"]
        ed_time = chunk_bars[-1]["endTime"]
        tension = chunk_bars[0]["tension"]

        # Summarize musical events
        events_desc = []
        for b in chunk_bars:
            b_idx = b["barIndex"]
            t_b = b["tension"]
            vocal_d = b["stemDominance"]["vocal"]
            drums_d = b["stemDominance"]["drums"]
            
            beat_details = []
            for beat in b["beats"]:
                b_num = beat["beatIndex"]
                p_hz = beat["pitchHz"]
                v_e = beat["stems"]["vocal"]
                d_e = beat["stems"]["drums"]
                tag = "人声主唱" if v_e > 0.25 else ("重底鼓" if d_e > 0.25 else "旋律")
                beat_details.append(f"拍{b_num}({tag}, {p_hz:.0f}Hz)")
            
            events_desc.append(f"- Bar {b_idx} [张力:{t_b}]: " + ", ".join(beat_details))

        user_prompt = f"""现在编排【第 {chunk_idx} 乐段: Beat {st_beat} 到 Beat {ed_beat-1}】(对应音频时间 {st_time:.2f}s 到 {ed_time:.2f}s)。
段落主情绪: {tension}。

上一乐段结束时的肢体状态延续: {last_hand_state}。

本段详细声学与咬字事件流：
""" + "\n".join(events_desc) + f"""

要求：
1. 必须覆盖 Beat {st_beat} 到 Beat {ed_beat-1} 范围；
2. 保持【极致跟人声流与主副歌节奏交替】，主唱咬字时必须精准挥击；
3. 严格遵循动量回摆 Parity。
请直接输出 ```bs-dsl ... ``` 代码块！
"""

        print(f"--> Invoking LLM for Chunk {chunk_idx}/{int(np.ceil(total_bars/chunk_size))}: Bars {chunk_bars[0]['barIndex']}..{chunk_bars[-1]['barIndex']} (Beats {st_beat}..{ed_beat-1})...")
        try:
            raw_resp = call_gemini(user_prompt)
            lines = parse_dsl(raw_resp)
            print(f"    Chunk {chunk_idx} done! Generated {len(lines)} notes lines.")
            all_dsl_lines.extend(lines)
            last_hand_state = f"上一击最后留在 Beat {ed_beat-1} 附近"
        except Exception as e:
            print(f"    Error in Chunk {chunk_idx}:", e)

    output_dsl_file = "dataset/full_song_gemini.dsl"
    with open(output_dsl_file, "w", encoding="utf-8") as f:
        f.write("\n".join(all_dsl_lines) + "\n")

    print(f"\n=== Full Song Generated! Total DSL Lines: {len(all_dsl_lines)} saved to {output_dsl_file} ===")

if __name__ == "__main__":
    import numpy as np
    generate_full_song()
