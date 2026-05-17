#!/usr/bin/env node
// Usage: node evals/runner.js [--dry-run]

// EVAL=1 so generate.js uses the stub db (though we no longer call generate.js).
// We DO still stub saveIcon / saveEvalRun to avoid any real DB writes from CLI.
process.env.EVAL = '1';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getIcons } from './stubs/db.js';
import { buildCasesFromIcons } from './cases.js';
import { checkStructural } from './metrics/structural.js';
import { checkSvgPath } from './metrics/svg-path.js';
import { checkBounds } from './metrics/bounds.js';
import { checkComplexity } from './metrics/complexity.js';
import { checkSemantic } from './metrics/semantic.js';
import { checkDesign } from './metrics/design.js';
import { checkTags } from './metrics/tags.js';
import { printCase, printSummary, saveResults } from './reporter.js';

const isDryRun = process.argv.includes('--dry-run');

// Load real icons from local JSON (no Supabase in CLI mode)
const icons = await getIcons();
const TEST_CASES = buildCasesFromIcons(icons);

const allResults = [];

function skippedMetric(name) {
  return { metric: name, pass: false, details: { error: 'Skipped (structural failed)' } };
}

console.log(`\nRunning icon evals (${isDryRun ? 'DRY RUN' : 'LIVE'}) — ${TEST_CASES.length} icons from library\n`);

await test('icon library eval suite', async (t) => {
  for (const testCase of TEST_CASES) {
    await t.test(testCase.id, async () => {
      // Use the icon's existing path + tags — no generation call
      const rawResponse = JSON.stringify(testCase.existingIcon);

      const structResult = checkStructural(rawResponse);
      const metrics = [structResult];

      if (structResult.pass && structResult.parsed) {
        const { path: pathD, tags } = structResult.parsed;
        const svgResult = checkSvgPath(pathD);
        metrics.push(svgResult);
        metrics.push(checkBounds(pathD));
        metrics.push(checkComplexity(svgResult.commandCount ?? 0));
        metrics.push(await checkSemantic(testCase, pathD, isDryRun));
        metrics.push(await checkDesign(testCase, pathD, isDryRun));
        metrics.push(await checkTags(testCase, tags, isDryRun));
      } else {
        metrics.push(
          skippedMetric('svg-path'), skippedMetric('bounds'), skippedMetric('complexity'),
          skippedMetric('semantic'), skippedMetric('design'), skippedMetric('tags'),
        );
      }

      const semanticResult = metrics.find(m => m.metric === 'semantic');
      const designResult = metrics.find(m => m.metric === 'design');
      const llmAvailable = !semanticResult?.details?.skipped;
      const overallPass = llmAvailable
        ? (semanticResult?.pass ?? false) && (designResult?.pass ?? false)
        : metrics.filter(m => !m.details?.skipped).every(m => m.pass);
      printCase(testCase, metrics);
      allResults.push({ caseId: testCase.id, testCase, overallPass, metrics });

      const failedMetrics = metrics.filter(m => !m.pass).map(m => m.metric);
      assert.ok(overallPass, `Failed: ${failedMetrics.join(', ')}`);
    });
  }
});

process.on('exit', () => {
  printSummary(allResults);
  saveResults(allResults, isDryRun);
});
