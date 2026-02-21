import { getIcons, saveIcon } from './db.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        const icons = await getIcons();
        return res.status(200).json({ icons });
    }

    if (req.method === 'POST') {
        const newIcon = req.body;
        if (!newIcon || !newIcon.path || !newIcon.id) {
            return res.status(400).json({ error: 'Invalid icon data.' });
        }

        const saved = await saveIcon(newIcon);
        if (!saved) {
            return res.status(400).json({ error: 'Icon already exists or failed to save.' });
        }

        return res.status(200).json({ success: true, icon: newIcon });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
