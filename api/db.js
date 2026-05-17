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

    // Get whatever is in icon_scores (may be partial — only icons that have been explicitly scored)
    let tableScores = [];
    try {
        const { data, error } = await supabase.from('icon_scores').select('*');
        if (!error && data) tableScores = data;
        else if (error) console.error('getIconScores (will supplement from eval_runs):', error.message);
    } catch (err) {
        console.error('getIconScores exception:', err);
    }

    // Supplement from eval_runs for any icons not yet in icon_scores.
    // Finds the latest live run (quality) + latest dry run (tech) and merges them.
    try {
        const scoredIds = new Set(tableScores.map(s => s.icon_id));

        const { data: runMeta } = await supabase
            .from('eval_runs')
            .select('id, dry_run, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        if (!runMeta?.length) return tableScores;

        const latestLive = runMeta.find(r => !r.dry_run);
        const latestDry  = runMeta.find(r =>  r.dry_run);
        const ids = [...new Set([latestLive?.id, latestDry?.id].filter(Boolean))];
        if (!ids.length) return tableScores;

        const { data: runs } = await supabase
            .from('eval_runs')
            .select('id, dry_run, results')
            .in('id', ids);

        if (!runs?.length) return tableScores;

        // Build per-icon map from eval_runs — dry first, then overlay live quality
        const iconMap = new Map();
        const sorted = [...runs].sort((a, b) => (a.dry_run ? 1 : 0) - (b.dry_run ? 1 : 0));

        for (const run of sorted) {
            for (const r of (run.results || [])) {
                if (scoredIds.has(r.caseId)) continue; // already in icon_scores — skip
                const existing = iconMap.get(r.caseId);
                if (!existing) {
                    iconMap.set(r.caseId, JSON.parse(JSON.stringify(r)));
                } else if (!run.dry_run) {
                    const liveQuality = r.metrics.filter(
                        m => ['semantic', 'design', 'tags'].includes(m.metric) && !m.details?.skipped
                    );
                    for (const lm of liveQuality) {
                        const idx = existing.metrics.findIndex(m => m.metric === lm.metric);
                        if (idx >= 0) existing.metrics[idx] = lm;
                    }
                    const sem = existing.metrics.find(m => m.metric === 'semantic');
                    const des = existing.metrics.find(m => m.metric === 'design');
                    const llmAvailable = !sem?.details?.skipped;
                    existing.overallPass = llmAvailable
                        ? (sem?.pass ?? false) && (des?.pass ?? false)
                        : existing.metrics.filter(m => !m.details?.skipped).every(m => m.pass);
                }
            }
        }

        // Convert reconstructed results to icon_scores row format
        const g = (r, name) => r.metrics?.find(m => m.metric === name) ?? null;
        const reconstructed = Array.from(iconMap.values()).map(r => ({
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

        return [...tableScores, ...reconstructed];
    } catch (err) {
        console.error('getIconScores supplement error:', err);
        return tableScores;
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
