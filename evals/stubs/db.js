import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../api/icons-data.json'
);

export async function getIcons() {
  try { return JSON.parse(readFileSync(DATA_PATH, 'utf-8')); }
  catch { return []; }
}

export async function saveIcon(_icon) { return true; }
export async function saveEvalRun(_run) { return null; }
export async function getEvalRuns(_limit) { return []; }
