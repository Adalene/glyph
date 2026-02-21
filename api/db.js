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
