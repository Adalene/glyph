import { judgeWithLLM } from '../judge.js';

function buildPrompt(name, category, style, pathD) {
  return `You are an expert icon design critic evaluating a generated SVG icon path.

ICON CONTEXT:
- Name: "${name}"
- Category: "${category}"
- Style: "${style}"
- SVG path d attribute: "${pathD}"

TASK: Evaluate whether this path represents a recognizable, conceptually appropriate icon for "${name}".
Would a designer recognize this as an attempt at "${name}"?
Do NOT penalize valid geometric representations — simple concepts can have simple paths.

Respond with ONLY this JSON (no markdown):
{"pass": true, "score": 0, "reason": "<one sentence>"}

Score guide: 5=perfect match, 4=good, 3=recognizable, 2=weak, 1=unrelated, 0=wrong/empty. Pass threshold: score >= 3.`;
}

export async function checkSemantic(testCase, pathD, dryRun = false) {
  if (dryRun) {
    return { metric: 'semantic', pass: true, details: { score: 5, reason: 'Dry-run skip', skipped: true } };
  }
  const judgment = await judgeWithLLM(buildPrompt(testCase.name, testCase.category, testCase.style, pathD));
  const pass = judgment.pass ?? (judgment.score >= 3);
  return { metric: 'semantic', pass, details: { score: judgment.score, reason: judgment.reason } };
}
