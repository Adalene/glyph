import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Local fallback for development/safety
const DATA_PATH = path.join(process.cwd(), 'api', 'icons-data.json');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Only initialize if keys are present
const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export async function getIcons() {
    let baseIcons = [];

    // 1. Load base icons from local fallback
    if (fs.existsSync(DATA_PATH)) {
        try {
            const data = fs.readFileSync(DATA_PATH, 'utf8');
            baseIcons = JSON.parse(data);
        } catch (err) {
            console.error('Local read error:', err);
        }
    }

    // 2. Try Supabase for community/generated icons
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('icons')
                .select('*')
                .order('generated', { ascending: true }); // Base icons first if they are in DB

            if (!error && data) {
                // Merge base icons with Supabase icons, ensuring uniqueness by ID
                const baseIds = new Set(baseIcons.map(i => i.id));
                const extraIcons = data.filter(i => !baseIds.has(i.id));
                return [...baseIcons, ...extraIcons];
            }
        } catch (err) {
            console.error('Supabase fetch error:', err);
        }
    }

    return baseIcons;
}

export async function getEvalRuns(limit = 20) {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('eval_runs')
                .select('id, timestamp, total, passed, summary, dry_run, created_at')
                .order('created_at', { ascending: false })
                .limit(limit);
            if (!error && data) return data;
        } catch (err) {
            console.error('Supabase eval_runs fetch error:', err);
        }
    }
    return [];
}

export async function getEvalRun(id) {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('eval_runs')
                .select('*')
                .eq('id', id)
                .single();
            if (!error && data) return data;
        } catch (err) {
            console.error('Supabase getEvalRun error:', err);
        }
    }
    return null;
}

export async function upsertIconScores(results, dryRun) {
    if (!supabase || !results.length) return;
    const now = new Date().toISOString();
    const g = (r, name) => r.metrics?.find(m => m.metric === name) ?? null;
    const rows = results.map(r => {
        const row = {
            icon_id: r.caseId,
            name: r.testCase?.name ?? r.caseId,
            structural: g(r, 'structural'),
            svg_path: g(r, 'svg-path'),
            bounds: g(r, 'bounds'),
            complexity: g(r, 'complexity'),
            last_run_at: now,
        };
        // Only overwrite quality metrics on live runs — preserve previous live results otherwise
        if (!dryRun) {
            row.semantic = g(r, 'semantic');
            row.design = g(r, 'design');
            row.tags = g(r, 'tags');
            row.last_live_run_at = now;
        }
        return row;
    });
    try {
        const { error } = await supabase
            .from('icon_scores')
            .upsert(rows, { onConflict: 'icon_id' });
        if (error) console.error('upsertIconScores error:', error.message);
    } catch (err) {
        console.error('upsertIconScores exception:', err);
    }
}

export async function getIconScores() {
    if (!supabase) return [];

    // Try icon_scores table first
    try {
        const { data, error } = await supabase
            .from('icon_scores')
            .select('*');
        if (!error && data?.length) return data;
        // Table missing or empty — fall through to reconstruct from eval_runs
        if (error) console.error('getIconScores (will fallback):', error.message);
    } catch (err) {
        console.error('getIconScores exception (will fallback):', err);
    }

    // Fallback: reconstruct per-icon merged scores from stored eval_runs results.
    // Finds the latest live run (for quality scores) + latest dry run (for tech scores)
    // and merges them so both concept/visual and tech metrics show up.
    try {
        const { data: runMeta } = await supabase
            .from('eval_runs')
            .select('id, dry_run, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        if (!runMeta?.length) return [];

        const latestLive = runMeta.find(r => !r.dry_run);
        const latestDry  = runMeta.find(r =>  r.dry_run);
        const ids = [...new Set([latestLive?.id, latestDry?.id].filter(Boolean))];
        if (!ids.length) return [];

        const { data: runs } = await supabase
            .from('eval_runs')
            .select('id, dry_run, results')
            .in('id', ids);

        if (!runs?.length) return [];

        // Build per-icon map — dry run first (baseline), then overlay live quality scores
        const iconMap = new Map();
        const sorted = [...runs].sort((a, b) => (a.dry_run ? 1 : 0) - (b.dry_run ? 1 : 0)); // dry first, live second

        for (const run of sorted) {
            for (const r of (run.results || [])) {
                const existing = iconMap.get(r.caseId);
                if (!existing) {
                    iconMap.set(r.caseId, JSON.parse(JSON.stringify(r)));
                } else if (!run.dry_run) {
                    // Overlay quality metrics from the live run
                    const liveQuality = r.metrics.filter(
                        m => ['semantic', 'design', 'tags'].includes(m.metric) && !m.details?.skipped
                    );
                    for (const lm of liveQuality) {
                        const idx = existing.metrics.findIndex(m => m.metric === lm.metric);
                        if (idx >= 0) existing.metrics[idx] = lm;
                    }
                    // Recalculate overallPass after merge
                    const sem = existing.metrics.find(m => m.metric === 'semantic');
                    const des = existing.metrics.find(m => m.metric === 'design');
                    const llmAvailable = !sem?.details?.skipped;
                    existing.overallPass = llmAvailable
                        ? (sem?.pass ?? false) && (des?.pass ?? false)
                        : existing.metrics.filter(m => !m.details?.skipped).every(m => m.pass);
                }
            }
        }

        // Convert to icon_scores row format (same shape the frontend expects)
        const g = (r, name) => r.metrics?.find(m => m.metric === name) ?? null;
        return Array.from(iconMap.values()).map(r => ({
            icon_id: r.caseId,
            name: r.testCase?.name ?? r.caseId,
            structural: g(r, 'structural'),
            svg_path:   g(r, 'svg-path'),
            bounds:     g(r, 'bounds'),
            complexity: g(r, 'complexity'),
            semantic:   g(r, 'semantic'),
            design:     g(r, 'design'),
            tags:       g(r, 'tags'),
            last_live_run_at: latestLive ? 'reconstructed' : null,
        }));
    } catch (err) {
        console.error('getIconScores fallback error:', err);
        return [];
    }
}

export async function saveEvalRun(run) {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('eval_runs')
                .insert([{
                    timestamp: run.timestamp,
                    total: run.total,
                    passed: run.passed,
                    summary: run.summary,
                    results: run.results,
                    dry_run: run.dryRun ?? false,
                }])
                .select('id')
                .single();
            if (!error && data) return data.id;
            console.error('Supabase eval_runs insert error:', error?.message);
        } catch (err) {
            console.error('Supabase saveEvalRun error:', err);
        }
    }
    return null;
}

export async function saveIcon(icon) {
    // 1. Save to Supabase
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('icons')
                .insert([{
                    id: icon.id,
                    name: icon.name,
                    category: icon.category,
                    tags: icon.tags || [],
                    path: icon.path,
                    generated: true,
                    generatedAt: Date.now()
                }])
                .select();

            if (!error) return true;
            console.error('Supabase insert error (might be duplicate slug):', error.message);
        } catch (err) {
            console.error('Supabase save error:', err);
        }
    }

    // 2. Local Fallback (Note: This won't persist in Vercel production)
    try {
        const icons = await getIcons();
        if (icons.find(i => i.id === icon.id)) return false;

        icons.push({
            ...icon,
            generated: true,
            generatedAt: Date.now()
        });

        // This is mainly for local development
        if (process.env.NODE_ENV !== 'production') {
            fs.writeFileSync(DATA_PATH, JSON.stringify(icons, null, 2));
        }
        return true;
    } catch (err) {
        console.error('Local save error:', err);
        return false;
    }
}
