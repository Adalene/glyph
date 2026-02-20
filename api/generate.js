/**
 * GLYPH — AI Icon Generator Proxy
 * 
 * This serverless function proxies requests to the Anthropic API.
 * Your ANTHROPIC_API_KEY lives ONLY as a Vercel environment variable —
 * it is never in source code and never exposed to the browser.
 *
 * Deploy: https://vercel.com → Project Settings → Environment Variables
 * Add:    ANTHROPIC_API_KEY = sk-ant-...
 */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — allow your GitHub Pages domain or any origin for open use
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const { name, category = 'objects', style = 'outline' } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing icon name.' });
  }

  const styleGuide = {
    outline: 'Clean minimal Lucide/Feather-style stroke paths. Simple geometric forms. Elegant and immediately recognizable.',
    minimal: 'Ultra-minimal. 2–4 strokes maximum. Abstract geometric reduction of the concept.',
    detailed: 'More complex with inner detail lines. Still stroke-only but richer silhouette.',
  }[style] || styleGuide.outline;

  const prompt = `You are an expert SVG icon designer for a stroke-based icon system (like Lucide or Feather Icons).

Design a "${name}" icon for category "${category}".
Style: ${styleGuide}

STRICT RULES:
- viewBox: 0 0 24 24
- Output ONLY the SVG path "d" attribute value(s)
- Multiple sub-paths: join with a space in one string
- NO fill anywhere — stroke only
- Coordinates stay within 2–22 (2px padding all sides)
- Must be immediately recognizable as "${name}"
- 3–6 relevant search tags

Respond ONLY with valid JSON, no markdown fences:
{"path":"<path d value>","tags":["tag1","tag2","tag3"]}`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest', // stable and fast for icon generation
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error('Anthropic API Error:', errorText);
      let errorMessage = 'Upstream API error.';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          errorMessage = `Anthropic Error: ${errorJson.error.message}`;
        }
      } catch (e) { }
      return res.status(upstream.status).json({ error: errorMessage });
    }

    const data = await upstream.json();

    const text = data.content.map(c => c.text || '').join('').trim()
      .replace(/```json\s*/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);
    if (!parsed.path) throw new Error('No path in response');

    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    return res.status(200).json({
      icon: {
        id: slug,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        category,
        tags: parsed.tags || [name.toLowerCase()],
        path: parsed.path,
        generated: true,
        generatedAt: Date.now(),
      }
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Failed to generate icon. Please try again.' });
  }
}
