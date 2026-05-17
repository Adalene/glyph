import { getIcons, getEvalRuns, getEvalRun, saveEvalRun } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
  try {
    const { id } = req.query || {};
    if (id) {
      const run = await getEvalRun(id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      return res.status(200).json({ run });
    }
    const runs = await getEvalRuns(20);
    return res.status(200).json({ runs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

const METRIC_NAMES = ['structural', 'svg-path', 'bounds', 'complexity', 'semantic', 'design', 'tags'];

function buildSummary(allResults) {
  const summary = {};
  for (const m of METRIC_NAMES) {
    const mResults = allResults.map(r => r.metrics.find(x => x.metric === m));
    summary[m] = {
      passed: mResults.filter(x => x?.pass).length,
      total: allResults.length,
      skipped: mResults.filter(x => x?.details?.skipped).length,
    };
  }
  return summary;
}

async function handlePost(req, res) {
  const { dryRun = true, maxCases } = req.body || {};
  // Default to 30 icons in LIVE mode to keep runs fast; DRY runs all icons
  const effectiveMax = dryRun ? (maxCases ?? Infinity) : (maxCases ?? 30);

  // Server-Sent Events setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  const allResults = [];

  try {
    const [
      { buildCasesFromIcons },
      { checkStructural },
      { checkSvgPath },
      { checkBounds },
      { checkComplexity },
      { checkSemantic },
      { checkDesign },
      { checkTags },
    ] = await Promise.all([
      import('../evals/cases.js'),
      import('../evals/metrics/structural.js'),
      import('../evals/metrics/svg-path.js'),
      import('../evals/metrics/bounds.js'),
      import('../evals/metrics/complexity.js'),
      import('../evals/metrics/semantic.js'),
      import('../evals/metrics/design.js'),
      import('../evals/metrics/tags.js'),
    ]);

    const icons = await getIcons();
    const testCases = buildCasesFromIcons(icons, effectiveMax);

    // Send all icons for UI pre-population, sampled subset will be evaluated
    const allIconMeta = icons.map(ic => ({ id: ic.id, name: ic.name, category: ic.category }));
    send({ type: 'start', total: testCases.length, dryRun, allIcons: allIconMeta });

    for (const testCase of testCases) {
      const rawResponse = JSON.stringify(testCase.existingIcon);
      const structResult = checkStructural(rawResponse);
      const metrics = [structResult];

      if (structResult.pass && structResult.parsed) {
        const { path: pathD, tags } = structResult.parsed;
        const svgResult = checkSvgPath(pathD);
        metrics.push(svgResult);
        metrics.push(checkBounds(pathD));
        metrics.push(checkComplexity(svgResult.commandCount ?? 0));

        // Run all 3 LLM judges in parallel per icon
        const [semResult, desResult, tagResult] = await Promise.all([
          checkSemantic(testCase, pathD, dryRun),
          checkDesign(testCase, pathD, dryRun),
          checkTags(testCase, tags, dryRun),
        ]);
        metrics.push(semResult, desResult, tagResult);
      } else {
        for (const m of ['svg-path', 'bounds', 'complexity', 'semantic', 'design', 'tags']) {
          metrics.push({ metric: m, pass: false, details: { error: 'Skipped (structural failed)' } });
        }
      }

      const semanticResult = metrics.find(m => m.metric === 'semantic');
      const designResult = metrics.find(m => m.metric === 'design');
      const llmAvailable = !semanticResult?.details?.skipped;
      const overallPass = llmAvailable
        ? (semanticResult?.pass ?? false) && (designResult?.pass ?? false)
        : metrics.filter(m => !m.details?.skipped).every(m => m.pass);

      const result = { caseId: testCase.id, testCase, overallPass, metrics };
      allResults.push(result);
      send({ type: 'case', ...result });
    }

    const summary = buildSummary(allResults);
    const overallPassed = allResults.filter(r => r.overallPass).length;
    send({ type: 'done', summary, total: allResults.length, passed: overallPassed, dryRun });

  } catch (err) {
    send({ type: 'error', message: err.message });
  } finally {
    // Always persist whatever completed — full run or partial — so results aren't lost
    if (allResults.length > 0) {
      const summary = buildSummary(allResults);
      const overallPassed = allResults.filter(r => r.overallPass).length;
      await saveEvalRun({
        timestamp: new Date().toISOString(),
        dryRun,
        total: allResults.length,
        passed: overallPassed,
        summary,
        results: allResults,
      }).catch(e => console.error('saveEvalRun error:', e));
    }
    res.end();
  }
}
