const MIN_COMMANDS = 3;
const MAX_COMMANDS = 50;

export function checkComplexity(commandCount) {
  const tooSimple = commandCount < MIN_COMMANDS;
  const tooComplex = commandCount > MAX_COMMANDS;
  return {
    metric: 'complexity',
    pass: !tooSimple && !tooComplex,
    score: tooSimple ? 'too-simple' : tooComplex ? 'too-complex' : 'ok',
    details: { commandCount, min: MIN_COMMANDS, max: MAX_COMMANDS, tooSimple, tooComplex },
  };
}
