// Build eval cases from real library icons instead of hardcoded names.
// Each case wraps an existing icon — no generation step needed.
export function buildCasesFromIcons(icons, maxCases = Infinity) {
  const pool = [...icons];
  const sampled = isFinite(maxCases) && maxCases < pool.length
    ? pool.sort(() => Math.random() - 0.5).slice(0, maxCases)
    : pool;

  return sampled.map(icon => ({
    id: icon.id,
    name: icon.name,
    category: icon.category,
    style: 'outline', // existing library icons are all outline-style
    difficulty: icon.generated ? 'ai-generated' : 'curated',
    // Pre-existing path + tags — no generation call needed
    existingIcon: { path: icon.path, tags: Array.isArray(icon.tags) ? icon.tags : [] },
  }));
}
