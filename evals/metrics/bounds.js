// Checks that absolute coordinates in the path stay within [min, max].
// Relative commands (lowercase: l, h, v, c, s, q, t, a, m) produce offset values
// that can legitimately be negative or exceed 24 — those are skipped.
// Only uppercase (absolute) commands M L H V C S Q T A are checked.

const NUM_RE = /-?\d*\.?\d+(?:[eE][+-]?\d+)?/g;

// Number of numeric arguments each absolute command consumes per repetition.
// Used to walk the token stream correctly.
const ABS_CMD_ARGS = {
  M: 2, L: 2, H: 1, V: 1,
  C: 6, S: 4, Q: 4, T: 2,
  A: 7, Z: 0,
};
const REL_CMDS = new Set(['m','l','h','v','c','s','q','t','a','z']);

export function checkBounds(pathD, min = 2, max = 22) {
  const result = { metric: 'bounds', pass: false, details: {} };

  // Tokenize: split into commands and number sequences
  const TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
  const tokens = [...pathD.matchAll(TOKEN_RE)];

  const absoluteNumbers = [];
  let currentIsAbsolute = false;

  for (const token of tokens) {
    if (token[1]) {
      // It's a command letter
      const cmd = token[1];
      currentIsAbsolute = !REL_CMDS.has(cmd) && cmd !== 'Z' && cmd !== 'z';
    } else if (token[2] !== undefined) {
      if (currentIsAbsolute) {
        absoluteNumbers.push(parseFloat(token[2]));
      }
    }
  }

  if (absoluteNumbers.length === 0) {
    result.pass = true;
    result.details = { checkedCoordinates: 0, violations: 0 };
    return result;
  }

  const violations = absoluteNumbers.filter(n => n < min || n > max);
  result.details = {
    checkedCoordinates: absoluteNumbers.length,
    violationCount: violations.length,
    violations: violations.slice(0, 10), // cap for readability
  };
  result.pass = violations.length === 0;
  return result;
}
