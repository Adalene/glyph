import { judgeWithLLM } from '../judge.js';

function buildPrompt(name, category, tags) {
  return `You are evaluating auto-generated search tags for an SVG icon.

ICON CONTEXT:
- Name: "${name}"
- Category: "${category}"
- Tags: ${JSON.stringify(tags)}

TASK: Are these tags accurate, relevant, and useful for searching for this icon?
Do they include the concept, synonyms, or related terms a user would search for?
Are any tags misleading or completely off-topic?

Respond with ONLY this JSON (no markdown):
{"pass": true, "score": 0, "reason": "<one sentence>", "badTags": []}

Score guide: 5=excellent search utility, 4=good, 3=acceptable, 2=weak/generic, 1=mostly wrong, 0=all wrong. Pass threshold: score >= 3. badTags is an array of any tags that are clearly wrong (can be []).`;
}

export async function checkTags(testCase, tags, dryRun = false) {
  if (dryRun) {
    return { metric: 'tags', pass: true, details: { score: 5, reason: 'Dry-run skip', skipped: true, badTags: [] } };
  }
  const judgment = await judgeWithLLM(buildPrompt(testCase.name, testCase.category, tags));
  const pass = judgment.pass ?? (judgment.score >= 3);
  return {
    metric: 'tags',
    pass,
    details: { score: judgment.score, reason: judgment.reason, badTags: judgment.badTags ?? [] },
  };
}
