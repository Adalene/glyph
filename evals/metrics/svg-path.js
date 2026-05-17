// Tokenizes and validates SVG path d attribute syntax
const PATH_TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
const VALID_CMD_RE = /^[MmLlHhVvCcSsQqTtAaZz]$/;

export function checkSvgPath(pathD) {
  const result = { metric: 'svg-path', pass: false, details: {}, commandCount: 0 };
  if (typeof pathD !== 'string' || pathD.trim() === '') {
    result.details.error = 'Empty or non-string path';
    return result;
  }

  const tokens = [...pathD.matchAll(PATH_TOKEN_RE)];
  if (tokens.length === 0) {
    result.details.error = 'No tokens found in path';
    return result;
  }

  const firstCmd = tokens[0][1];
  if (!firstCmd || !/^[Mm]/.test(firstCmd)) {
    result.details.error = `Path must begin with M/m, got: "${tokens[0][0]}"`;
    return result;
  }

  const commands = tokens.filter(t => t[1]);
  const unknownCmds = commands.filter(t => !VALID_CMD_RE.test(t[1]));

  result.commandCount = commands.length;
  result.details = { commandCount: commands.length, unknownCommands: unknownCmds.map(t => t[1]) };
  result.pass = unknownCmds.length === 0;
  return result;
}
