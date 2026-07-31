// Translation + quality-scoring loop, ported from the original translator.py
// (translate_text_with_quality / validate_translation_quality).
// Runs directly against the Groq API — no Lovable AI Gateway, no metered
// gateway credits.

import {
  SYSTEM_PROMPT_BASE,
  USER_TERMS_INSTRUCTION,
  MASK_INSTRUCTION,
  RETRY_PROMPT_ADDITION,
  QUALITY_ASSESSMENT_PROMPT,
} from "./prompts.server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";
const QUALITY_THRESHOLD = 30;
const MAX_RETRIES = 3;

function stripReasoningArtifacts(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function callModel(
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      reasoning_format: "hidden", // required for openai/gpt-oss-120b on Groq
    }),
  });

  if (res.status === 429) throw new Error("Rate limit reached, please retry shortly");
  if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return stripReasoningArtifacts(data.choices?.[0]?.message?.content?.trim() ?? "");
}

async function validateQuality(original: string, translated: string, targetLang: string): Promise<number> {
  try {
    const scoreText = await callModel(
      [{ role: "user", content: QUALITY_ASSESSMENT_PROMPT(targetLang, original, translated) }],
      16,
      0,
    );
    const match = scoreText.match(/\d+/);
    const score = match ? parseInt(match[0], 10) : 20;
    return Math.max(0, Math.min(40, score));
  } catch {
    return 20;
  }
}

export interface SegmentResult {
  translated: string;
  quality: number;
}

async function translateWithQuality(
  maskedText: string,
  targetLang: string,
  userTerms: string[],
): Promise<SegmentResult> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let systemPrompt = SYSTEM_PROMPT_BASE(targetLang);
      if (userTerms.length) {
        systemPrompt += USER_TERMS_INSTRUCTION(userTerms.map((t) => `"${t}"`).join(", "));
      }
      systemPrompt += MASK_INSTRUCTION;
      if (attempt > 0) systemPrompt += RETRY_PROMPT_ADDITION(attempt + 1);

      const translated = await callModel(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: maskedText },
        ],
        4000,
        attempt > 0 ? 0.1 : 0,
      );

      if (!translated) {
        if (attempt === MAX_RETRIES - 1) return { translated: maskedText, quality: 0 };
        continue;
      }

      const quality = await validateQuality(maskedText, translated, targetLang);
      if (quality >= QUALITY_THRESHOLD || attempt === MAX_RETRIES - 1) {
        return { translated, quality };
      }
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt + Math.random() * 400));
  }
  return { translated: maskedText, quality: 0 };
}

export async function translateBatch(
  segments: string[],
  targetLang: string,
  userTerms: string[],
): Promise<SegmentResult[]> {
  const concurrency = 6;
  const results: SegmentResult[] = new Array(segments.length);
  let cursor = 0;

  async function worker() {
    while (cursor < segments.length) {
      const i = cursor++;
      results[i] = await translateWithQuality(segments[i], targetLang, userTerms);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, segments.length) }, worker));
  return results;
}
