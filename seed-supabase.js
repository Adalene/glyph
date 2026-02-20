/**
 * SUPABASE SEED SCRIPT
 * Run this to push all icons from api/icons.json to your Supabase table.
 * 
 * Usage:
 * 1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your terminal/env
 * 2. Run: node seed-supabase.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'api', 'icons.json');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
    console.log('Reading icons.json...');
    const rawData = fs.readFileSync(DATA_PATH, 'utf8');
    const icons = JSON.parse(rawData);

    console.log(`Found ${icons.length} icons. Uploading to Supabase...`);

    // We upload in chunks to avoid any request limits
    const chunkSize = 50;
    for (let i = 0; i < icons.length; i += chunkSize) {
        const chunk = icons.slice(i, i + chunkSize).map(icon => ({
            id: icon.id,
            name: icon.name,
            category: icon.category,
            tags: icon.tags || [],
            path: icon.path,
            generated: icon.generated || false,
            generatedAt: icon.generatedAt || null
        }));

        const { error } = await supabase
            .from('icons')
            .upsert(chunk, { onConflict: 'id' });

        if (error) {
            console.error(`Error uploading chunk ${i}-${i + chunkSize}:`, error.message);
        } else {
            console.log(`Uploaded icons ${i} to ${Math.min(i + chunkSize, icons.length)}`);
        }
    }

    console.log('Seeding completed!');
}

seed().catch(console.error);
