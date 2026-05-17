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

async function handlePost(req, res) {
  const { dryRun = true, maxCases } = req.body || {};

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

    // Fetch real icons from the library (Supabase + local base icons)
    const icons = await getIcons();
    const testCases = buildCasesFromIcons(icons, maxCases);

    send({ type: 'start', total: testCases.length, dryRun });

    const allResults = [];

    for (const testCase of testCases) {
      // Use the icon's existing path + tags directly — no generation step
      const rawResponse = JSON.stringify(testCase.existingIcon);

      const structResult = checkStructural(rawResponse);
      const metrics = [structResult];

      if (structResult.pass && structResult.parsed) {
        const { path: pathD, tags } = structResult.parsed;
        const svgResult = checkSvgPath(pathD);
        metrics.push(svgResult);
        metrics.push(checkBounds(pathD));
        metrics.push(checkComplexity(svgResult.commandCount ?? 0));
        // LLM judges only in live mode
        metrics.push(await checkSemantic(testCase, pathD, dryRun));
        metrics.push(await checkDesign(testCase, pathD, dryRun));
        metrics.push(await checkTags(testCase, tags, dryRun));
      } else {
        for (const m of ['svg-path', 'bounds', 'complexity', 'semantic', 'design', 'tags']) {
          metrics.push({ metric: m, pass: false, details: { error: 'Skipped (structural failed)' } });
        }
      }

      // Quality metrics (semantic + design) are what matter most.
      // Tech checks are informational only. In dry-run (skipped), fall back to tech.
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

    // Per-metric summary
    const METRIC_NAMES = ['structural', 'svg-path', 'bounds', 'complexity', 'semantic', 'design', 'tags'];
    const summary = {};
    for (const m of METRIC_NAMES) {
      const mResults = allResults.map(r => r.metrics.find(x => x.metric === m));
      summary[m] = {
        passed: mResults.filter(x => x?.pass).length,
        total: allResults.length,
        skipped: mResults.filter(x => x?.details?.skipped).length,
      };
    }

    const overallPassed = allResults.filter(r => r.overallPass).length;
    const runData = {
      timestamp: new Date().toISOString(),
      dryRun,
      total: allResults.length,
      passed: overallPassed,
      summary,
      results: allResults,
    };

    // Persist to Supabase
    await saveEvalRun(runData);

    send({ type: 'done', summary, total: allResults.length, passed: overallPassed, dryRun });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
}
