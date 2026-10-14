import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deterministic Kinematic State Machine Agent
 * Emulates ideal Parity choreography adhering to all kinematic rules
 */
export function heuristicChoreographer(slotsData) {
  const bars = slotsData.bars || [];
  const dslLines = [];

  // Current hand positions and swing states
  // lastDir: 1 = Down, 0 = Up
  let leftLastDir = 0;  // Pre-condition ready to strike down
  let rightLastDir = 0; // Pre-condition ready to strike down

  for (const bar of bars) {
    const role = bar.musical_role || 'verse';
    const isChorus = role === 'chorus_drop';

    for (const evt of bar.rhythmic_events) {
      const beat = evt.beat;
      const tag = evt.tag;
      const beatInBar = evt.beat_in_bar;

      let leftToken = null;
      let rightToken = null;

      if (tag === 'kick') {
        // Kick: On-beat strike. Ensure alternation
        const nextLeftDir = (leftLastDir === 1) ? 0 : 1;
        const nextRightDir = (rightLastDir === 1) ? 0 : 1;
        leftLastDir = nextLeftDir;
        rightLastDir = nextRightDir;

        const leftY = nextLeftDir === 1 ? 0 : 1;
        const rightY = nextRightDir === 1 ? 0 : 1;
        leftToken = `R1${leftY}${nextLeftDir}`;
        rightToken = `B2${rightY}${nextRightDir}`;
      } else if (tag === 'snare') {
        // Snare: Backbeat recoil strike
        const nextLeftDir = (leftLastDir === 1) ? 0 : 1;
        const nextRightDir = (rightLastDir === 1) ? 0 : 1;
        leftLastDir = nextLeftDir;
        rightLastDir = nextRightDir;

        const leftY = nextLeftDir === 1 ? 0 : 1;
        const rightY = nextRightDir === 1 ? 0 : 1;
        leftToken = `R1${leftY}${nextLeftDir}`;
        rightToken = `B2${rightY}${nextRightDir}`;
      } else if (tag === 'hat') {
        if (isChorus) {
          // Rapid stream in drop
          if (beatInBar === 0.5 || beatInBar === 2.5) {
            // Left hand syncopated cut
            const nextDir = (leftLastDir === 1) ? 0 : 1;
            leftLastDir = nextDir;
            const y = nextDir === 1 ? 0 : 2;
            leftToken = `R1${y}${nextDir}`;
          } else if (beatInBar === 1.5 || beatInBar === 3.5) {
            // Right hand syncopated cut
            const nextDir = (rightLastDir === 1) ? 0 : 1;
            rightLastDir = nextDir;
            const y = nextDir === 1 ? 0 : 2;
            rightToken = `B2${y}${nextDir}`;
          }
        } else if (evt.intensity > 0.4 && (beatInBar === 1.5 || beatInBar === 3.5)) {
          // Dot decoration resets parity neutrally
          rightToken = `B218`;
        }
      }

      if (leftToken || rightToken) {
        const lStr = leftToken || '';
        const rStr = rightToken || '';
        if (rStr) {
          dslLines.push(`${beat}: ${lStr} | ${rStr}`);
        } else {
          dslLines.push(`${beat}: ${lStr}`);
        }
      }
    }
  }

  return dslLines.join('\n');
}

/**
 * Calls OpenAI-compatible API to generate BS-DSL
 */
export async function callLlmApi(prompt, slotsJson, apiKey, baseUrl, model = 'gpt-4o-mini') {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = {
    model: model,
    messages: [
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: `请针对以下 15 秒音乐时间槽数据（128 BPM, 8 小节），严格根据人体工学 Parity 律与音乐重音规划，输出完整的 BS-DSL：\n\n${JSON.stringify(slotsJson, null, 2)}`
      }
    ],
    temperature: 0.3
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API request failed with status ${response.status}: ${text}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || '';
  return content;
}

/**
 * Cleans and filters raw LLM text to extract only valid DSL lines
 */
export function sanitizeDslText(rawText) {
  const lines = rawText.split('\n');
  const cleanLines = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    // Remove markdown code fences
    if (line.startsWith('```')) continue;
    // Must start with a number (the beat timestamp)
    if (/^[0-9]+(\.[0-9]+)?\s*:\s*[RB0-9| ]+/.test(line)) {
      cleanLines.push(line);
    }
  }

  return cleanLines.join('\n');
}

/**
 * Main generate entry
 */
export async function generateDsl(options = {}) {
  const slotsPath = options.slotsPath || path.resolve(__dirname, '../../dataset/slots.json');
  const promptPath = options.promptPath || path.resolve(__dirname, 'prompts/kinematics_system.md');
  const outputPath = options.outputPath || path.resolve(__dirname, '../../dataset/generated.dsl');

  const slotsRaw = fs.readFileSync(slotsPath, 'utf-8');
  const slotsData = JSON.parse(slotsRaw);
  const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

  const apiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  let rawDsl = '';

  if (apiKey) {
    console.log(`[LLM-Generator] API Key detected. Calling LLM model: ${model}...`);
    try {
      rawDsl = await callLlmApi(systemPrompt, slotsData, apiKey, baseUrl, model);
      console.log(`[LLM-Generator] Received response from ${model}`);
    } catch (err) {
      console.warn(`[LLM-Generator] API call failed: ${err.message}. Falling back to internal Kinematic State Machine.`);
      rawDsl = heuristicChoreographer(slotsData);
    }
  } else {
    console.log('[LLM-Generator] No API Key provided in env. Executing internal Neuro-Symbolic Kinematic Agent...');
    rawDsl = heuristicChoreographer(slotsData);
  }

  const cleanDsl = sanitizeDslText(rawDsl);
  fs.writeFileSync(outputPath, cleanDsl, 'utf-8');
  console.log(`[LLM-Generator] Generated BS-DSL saved to: ${outputPath}`);

  return cleanDsl;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateDsl().catch(err => {
    console.error('[LLM-Generator] Error:', err);
    process.exit(1);
  });
}
