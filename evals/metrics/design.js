import { judgeWithLLM } from '../judge.js';

function buildPrompt(name, category, style, pathD) {
  return `You are a senior icon designer reviewing an SVG icon path for visual quality and design guideline compliance.
The icon should match the style of Lucide, Feather, or Heroicons icon libraries.

ICON CONTEXT:
- Name: "${name}"
- Category: "${category}"
- Requested style: "${style}" (outline=simple stroke, minimal=2-4 strokes max, detailed=richer construction)
- SVG path d attribute: "${pathD}"

EVALUATE on all four dimensions:
1. Representation — Does the path visually represent "${name}"? Is it immediately recognizable?
2. Guidelines — Stroke-only (no fills implied), geometric/grid-aligned shapes, minimal control points, appropriate complexity for the requested style, coordinates within 24x24 viewBox.
3. Aesthetics — Balanced visual weight, optically centered, clean and elegant. Would it look good at 16px?
4. Polish — Does it look like a professional icon or like a rough draft?

Respond with ONLY this JSON (no markdown):
{"pass": true, "score": 0, "subscores": {"representation": 0, "guidelines": 0, "aesthetics": 0, "polish": 0}, "reason": "<one sentence>"}

Score guide: 5=production-ready, 4=good, 3=acceptable, 2=needs work, 1=poor, 0=unusable. Pass threshold: score >= 3.`;
}

export async function checkDesign(testCase, pathD, dryRun = false) {
  if (dryRun) {
    return {
      metric: 'design',
      pass: true,
      details: { score: 5, subscores: {}, reason: 'Dry-run skip', skipped: true },
    };
  }
  const judgment = await judgeWithLLM(buildPrompt(testCase.name, testCase.category, testCase.style, pathD));
  const pass = judgment.pass ?? (judgment.score >= 3);
  return {
    metric: 'design',
    pass,
    details: { score: judgment.score, subscores: judgment.subscores ?? {}, reason: judgment.reason },
  };
}
