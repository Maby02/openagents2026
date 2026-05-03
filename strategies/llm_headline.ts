import type { Evidence, Forecast, Market, StrategyMeta } from "../src/strategy-api.ts";

export const meta: StrategyMeta = {
  name: "llm-headline",
  version: "0.1.0",
  authorHandle: "sibyl-bundled",
  description: "Asks an LLM (gpt-4o-mini) to read recent evidence and produce a probability for outcome 0.",
  markets: ["crypto", "macro", "politics"],
  requiresEnv: ["OPENAI_API_KEY"],
};

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const STAKE_USD = 5;
const ENTRY_EDGE = 0.05; // require >5pp edge over current market price to take a position

export async function forecast(market: Market, evidence: Evidence): Promise<Forecast> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { probability: 0.5, confidence: 0, stakeUsd: 0, reasoning: "OPENAI_API_KEY not set" };
  }

  const currentP = market.currentPrices[0] ?? 0.5;
  const headlines = evidence.webSnippets.length
    ? evidence.webSnippets.map((s) => `- ${s.title}: ${s.text}`).join("\n")
    : "(no headlines available)";

  const prompt = [
    `You are a prediction-market analyst. The market asks:`,
    `"${market.question}"`,
    ``,
    `Possible outcomes: ${market.outcomes.join(" / ")}.`,
    `The market currently implies ${(currentP * 100).toFixed(1)}% probability for "${market.outcomes[0]}".`,
    ``,
    `Recent context:`,
    headlines,
    ``,
    `Respond with a single JSON object: {"probability": <0..1 for outcome 0>, "reason": "<one-sentence reason>"}.`,
    `Only respond with the JSON.`,
  ].join("\n");

  let probability: number | null = null;
  let reason = "";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return {
        probability: 0.5,
        confidence: 0,
        stakeUsd: 0,
        reasoning: `LLM call failed (${res.status}): ${errText.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseProbabilityJson(text);
    probability = parsed.probability;
    reason = parsed.reason;
  } catch (err) {
    return {
      probability: 0.5,
      confidence: 0,
      stakeUsd: 0,
      reasoning: `LLM call errored: ${(err as Error).message}`,
    };
  }

  if (probability == null) {
    return { probability: 0.5, confidence: 0, stakeUsd: 0, reasoning: "could not parse LLM probability" };
  }

  const edgeYes = probability - currentP;
  const edgeNo = 1 - probability - (1 - currentP);

  if (Math.abs(edgeYes) < ENTRY_EDGE && Math.abs(edgeNo) < ENTRY_EDGE) {
    return {
      probability,
      confidence: 0.4,
      stakeUsd: 0,
      reasoning: `LLM ${(probability * 100).toFixed(1)}% vs market ${(currentP * 100).toFixed(1)}% — edge too thin. ${reason}`,
    };
  }

  const outcomeIdx = edgeYes > edgeNo ? 0 : 1;
  return {
    probability: outcomeIdx === 0 ? probability : 1 - probability,
    confidence: Math.min(0.9, Math.max(Math.abs(edgeYes), Math.abs(edgeNo)) * 6),
    stakeUsd: STAKE_USD,
    outcomeIdx,
    reasoning: `LLM ${(probability * 100).toFixed(1)}% vs market ${(currentP * 100).toFixed(1)}% — buying ${market.outcomes[outcomeIdx]}. ${reason}`,
  };
}

interface ParsedLlmOut {
  probability: number | null;
  reason: string;
}

function parseProbabilityJson(text: string): ParsedLlmOut {
  try {
    const obj = JSON.parse(text) as { probability?: unknown; reason?: unknown };
    const p = typeof obj.probability === "number" ? obj.probability : null;
    const reason = typeof obj.reason === "string" ? obj.reason.slice(0, 280) : "";
    if (p == null || p < 0 || p > 1) return { probability: null, reason };
    return { probability: p, reason };
  } catch {
    // Fall back to scraping the first plausible probability out of the text.
    const m = text.match(/0?\.\d+|[01](?:\.\d+)?/);
    if (m) {
      const p = parseFloat(m[0]);
      if (p >= 0 && p <= 1) return { probability: p, reason: text.slice(0, 280) };
    }
    return { probability: null, reason: text.slice(0, 280) };
  }
}
