import json
import urllib.request

prompt = """你是一名世界顶级 Beat Saber (节奏光剑) 人类谱师与编舞大师 (例如 BennyDaBeast 级别的顶尖创作者)。
你拥有崇高且绝对的主观审美权、身体共情能力与音乐通感。
现在，请你为热门 J-Rock/Punk 歌曲《AKASAKI - シャケナベイベー (Shake Na Baby)》的前 15.36 秒 (Beat 0 到 Beat 27) 编排第一段富有灵魂的 Expert+ 谱面。

### 一、 音乐情境与全息事实 (0.73s - 15.36s / 速度 114.84 BPM)
- **Bar 0 [0.73s - 2.82s, Beat 0~3] (前奏蓄力)**:
  失真吉他与空灵扫弦，主唱还未爆发，微弱低吟。
  【谱师心流建议】: 极简主义！为玩家留出蓄力呼吸感，切忌过早堆砌音符，可考虑单手轻点或留白。
- **Bar 1~2 [2.82s - 7.00s, Beat 4~11] (人声入场与旋律爬升)**:
  主唱高音撕裂切入 (Beat 4 达到 503Hz)，随后语调抑扬顿挫。
  【谱师心流建议】: 赋予肢体唱歌的感觉！让右剑或左剑跟随歌词的押韵点起伏，动作流畅舒展。
- **Bar 3~4 [7.00s - 11.18s, Beat 12~19] (鼓点预备与能量爬升)**:
  军鼓逐渐躁动，主唱音调反复激荡 (542Hz -> 80Hz -> 539Hz)。
  【谱师心流建议】: 动势开始拉大，预示主歌高潮来临，设计有期待感的连击或对角准备手势。
- **Bar 5~6 [11.18s - 15.36s, Beat 20~27] (主歌第一爆发点)**:
  Beat 20 主唱飙到 703Hz 极高音！从 Beat 24 (13.27s) 起，重低音贝斯与底鼓 (Bass:0.40, Drums:0.34) 全面炸裂轰入！
  【谱师心流建议】: 彻底点燃全身！双手大开大合，双剑交错斩击，打出最爽快的切分重音与打击感。

### 二、 肢体语言与 BS-DSL 语法
每一行代表一个击打时间点：
`[Beat]: [LeftHand] | [RightHand]`  (单手则省略另一侧)
Token 格式: `[Hand][X][Y][Dir]`
- Hand: `R` (红方块/左手, X=0,1), `B` (蓝方块/右手, X=2,3)
- X (轨道): 0(最左), 1(中左), 2(中右), 3(最右)
- Y (高度): 0(腰部下层), 1(胸部中层), 2(头部上层)
- Dir (方向):
  - 0: 上(↑), 1: 下(↓), 2: 左(←), 3: 右(→)
  - 4: 左上(↖), 5: 右上(↗), 6: 左下(↙), 7: 右下(↘)
  - 8: 点(• Dot, 自由角度)

### 三、 人体解剖学安全底线 (避免伤害玩家)
1. **严格遵守动量回摆 (Parity)**: 下砍 (1, 6, 7) 之后手在下方，下一次挥砍必须是上砍 (0, 4, 5) 或点 (8)；严禁连续同向反关节强砍！
2. **严禁同拍手臂交叉锁死**: 同一拍如果双手同时出现，红色 X 严禁大于蓝色 X (红在左，蓝在右)。
3. **同拍同轨同层严禁重叠冲突**。

### 四、 输出要求
请先写出你的【编舞心流与意象设计构思 (Choreography Thinking)】，然后以纯文本代码块给出最终的 BS-DSL 序列。
必须只在 Beat 0 ~ 27 的范围内编排！
"""

url = "http://127.0.0.1:7860/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer 123456"
}
payload = {
    "model": "gemini-3.8-flash",
    "messages": [
        {"role": "user", "content": prompt}
    ],
    "temperature": 0.7,
    "max_tokens": 4096
}

req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
try:
    print("Calling local 7860 with gemini-3.8-flash...")
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        choice = result["choices"][0]["message"]
        content = choice.get("content", "")
        reasoning = choice.get("reasoning_content", "") or result.get("usage", {}).get("completion_tokens_details", {}).get("reasoning_tokens", "")
        print("=== Response Received Successfully ===")
        with open("dataset/llm_raw_response_demo.txt", "w", encoding="utf-8") as f:
            f.write(content)
        print("Length of response:", len(content))
        print("Sample of response:")
        print(content[:600])
except Exception as e:
    print("Error calling API:", e)
