// Plausible mock SVG paths for dry-run mode — tests structural/SVG checks without API calls
const VALID_PATH = 'M 5 12 L 19 12 M 12 5 L 12 19';
const VALID_TAGS = ['icon', 'shape', 'graphic'];

export function getMockResponse(_caseId, _input) {
  return JSON.stringify({ path: VALID_PATH, tags: VALID_TAGS });
}
