import dotenv from "dotenv";

dotenv.config();

const endpoint = process.env.AI_API_ENDPOINT || "https://api.866646.xyz/v1/chat/completions";
const apiKey = process.env.AI_API_KEY || "";
const model = process.env.AI_MODEL || "doubao-seed-2.0-pro";

export function getAIConfig() {
  return {
    endpoint,
    model,
    configured: Boolean(apiKey)
  };
}

function ensureConfigured() {
  if (!apiKey) {
    throw new Error("AI_API_KEY 未配置，暂时无法调用远程 AI。");
  }
}

async function callAI(messages, { temperature = 0.4, maxTokens = 1600 } = {}) {
  ensureConfigured();
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    throw new Error(`AI 接口调用失败，HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 没有返回可用内容。");
  }
  return content;
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const objectIndex = candidate.indexOf("{");
  const arrayIndex = candidate.indexOf("[");
  const startIndex = objectIndex === -1 ? arrayIndex : arrayIndex === -1 ? objectIndex : Math.min(objectIndex, arrayIndex);
  if (startIndex === -1) {
    throw new Error("AI 返回中没有可解析的 JSON。");
  }
  return JSON.parse(candidate.slice(startIndex));
}

export async function requestAIText({ systemPrompt, userPrompt, temperature, maxTokens }) {
  return callAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    { temperature, maxTokens }
  );
}

export async function requestAIJson({ systemPrompt, userPrompt, temperature = 0.2, maxTokens = 1800 }) {
  const text = await callAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${userPrompt}\n\n请只返回 JSON，不要附带多余解释。` }
    ],
    { temperature, maxTokens }
  );
  return extractJson(text);
}

