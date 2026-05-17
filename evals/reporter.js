import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const METRIC_ORDER = ['structural', 'svg-path', 'bounds', 'complexity', 'semantic', 'design', 'tags'];

export function printCase(testCase, metrics) {
  const allPass = metrics.every(m => m.pass);
  const status = allPass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  const failed = metrics.filter(m => !m.pass).map(m => m.metric);
  const suffix = failed.length ? `${DIM} [failed: ${failed.join(', ')}]${RESET}` : '';
  console.log(`  ${status}  ${testCase.id.padEnd(14)} "${testCase.name}" (${testCase.style})${suffix}`);
}

export function printSummary(allResults) {
  const total = allResults.length;
  if (total === 0) return;

  console.log('\n' + '='.repeat(64));
  console.log('EVAL SUMMARY');
  console.log('='.repeat(64));

  for (const metricName of METRIC_ORDER) {
    const metricResults = allResults.map(r => r.metrics.find(m => m.metric === metricName));
    const passed = metricResults.filter(m => m?.pass).length;
    const skipped = metricResults.filter(m => m?.details?.skipped).length;
    const pct = Math.round((passed / total) * 100);
    const filled = Math.round(pct / 5);
    const bar = '[' + '#'.repeat(filled) + '.'.repeat(20 - filled) + ']';
    const skipNote = skipped ? `${DIM} [${skipped} skipped]${RESET}` : '';
    console.log(`  ${metricName.padEnd(14)} ${bar} ${String(passed).padStart(2)}/${total} (${String(pct).padStart(3)}%)${skipNote}`);
  }

  const passAll = allResults.filter(r => r.overallPass).length;
  const overallPct = Math.round((passAll / total) * 100);
  console.log('  ' + '-'.repeat(60));
  console.log(`  ${'OVERALL'.padEnd(14)} ${' '.repeat(22)} ${passAll}/${total} (${overallPct}%)`);
  console.log('='.repeat(64) + '\n');
}

export function saveResults(allResults, dryRun) {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = `${ts}${dryRun ? '-dry-run' : ''}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun,
    total: allResults.length,
    passed: allResults.filter(r => r.overallPass).length,
    results: allResults,
  }, null, 2));
  console.log(`Results saved → evals/results/${filename}\n`);
}
