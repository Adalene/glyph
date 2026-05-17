export function checkStructural(raw) {
  const result = { metric: 'structural', pass: false, details: {} };
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    result.details.error = 'JSON parse failed: ' + e.message;
    return result;
  }

  const hasPath = typeof parsed?.path === 'string' && parsed.path.length > 0;
  const hasTagsArray = Array.isArray(parsed?.tags);
  const tagsAreStrings = hasTagsArray && parsed.tags.every(t => typeof t === 'string');
  const hasAtLeastOneTag = hasTagsArray && parsed.tags.length >= 1;

  result.details = { hasPath, hasTagsArray, tagsAreStrings, hasAtLeastOneTag };
  result.pass = hasPath && hasTagsArray && tagsAreStrings && hasAtLeastOneTag;
  result.parsed = parsed;
  return result;
}
