import { saveIcon } from './db.js';

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
    outline: 'Clean minimal Lucide/Feather-style stroke paths. Simple geometric forms. Elegant, balanced, and immediately recognizable. 2px equivalent weight.',
    minimal: 'Ultra-minimal reduction. 2–4 strokes maximum. Abstract geometric reduction of the concept focused on semantic essence.',
    detailed: 'Sophisticated construction with internal detail lines. Maintains stroke-only but provides a richer silhouette and narrative.',
  }[style] || 'Clean minimal Lucide/Feather-style stroke paths.';

  const prompt = `You are an elite Icon Designer, expert in minimalist, stroke-based iconography (e.g., Lucide, Feather, Heroicons). 

Your goal is to create a professional-grade SVG icon for "${name}" in the "${category}" category.

DESIGN REQUIREMENTS:
1. Grid-Based Construction: Design for a 24x24 grid. Align major points to the grid for optical sharpness.
2. Optical Centering: Ensure the visual weight of the icon is perfectly centered in the 24x24 frame.
3. Geometric Perfection: Use standard geometric primitives (circles, rects with radii, arcs, straight lines). Avoid organic or irregular paths.
4. Simplicity & Clarity: Use the absolute minimum number of points and paths. The icon must be legible at 16x16px.
5. Stroke Style: ${styleGuide}
6. No Fill: Output ONLY path data for strokes. NO fill-rule or fill attributes.

TECHNICAL RULES:
- ViewBox: "0 0 24 24"
- Padding: Keep all coordinates between 2 and 22 to prevent clipping.
- Output Format: ONLY return the "d" attribute string. If multiple paths are required, concatenate them with a single space.
- JSON Only: Respond with a single JSON object. No markdown, no commentary.

JSON Schema:
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
        model: 'claude-3-5-sonnet-20241022', // Reverting to high-quality stable 3.5 Sonnet as requested
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

    const icon = {
      id: slug,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      category,
      tags: parsed.tags || [name.toLowerCase()],
      path: parsed.path,
      generated: true,
      generatedAt: Date.now(),
    };

    // Save to shared library immediately
    await saveIcon(icon);

    return res.status(200).json({ icon });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Failed to generate icon. Please try again.' });
  }
}

