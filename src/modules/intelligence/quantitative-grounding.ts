interface NumericOccurrence {
  raw: string;
  comparable: string;
  units: Set<string>;
}

function comparableNumber(value: string): string {
  const negative = value.startsWith('-');
  const unsigned = value.replace(/^[+-]/u, '');
  const parts = unsigned.split(/[.,]/u);
  const signed = (normalized: string): string =>
    negative && !/^0(?:\.0*)?$/u.test(normalized) ? `-${normalized}` : normalized;
  if (parts.length === 1) return signed(unsigned.replace(/^0+(?=\d)/u, ''));
  const integer = parts[0] ?? '';
  const fraction = parts.at(-1) ?? '';
  const hasDecimal = fraction.length < 3 || integer === '0';
  const whole = (hasDecimal ? parts.slice(0, -1) : parts).join('').replace(/^0+(?=\d)/u, '');
  return signed(hasDecimal ? `${whole}.${fraction}` : whole);
}

function contextualUnits(value: string, start: number, end: number): Set<string> {
  const before = value.slice(Math.max(0, start - 40), start).toLocaleLowerCase('es');
  const after = value.slice(end, end + 70).toLocaleLowerCase('es');
  const units = new Set<string>();
  if (/(?:\bbs\.?|bolivianos?)\s*$/iu.test(before) || /^\s*bolivianos?\b/iu.test(after)) {
    units.add('BOB');
  }
  if (/(?:\busd|us\$|\$us|dólares?)\s*$/iu.test(before) || /^\s*dólares?\b/iu.test(after)) {
    units.add('USD');
  }
  if (/^\s*puntos?\s+porcentuales?\b/iu.test(after)) {
    units.add('PERCENTAGE_POINTS');
  } else if (/^\s*(?:%|por\s+ciento\b)/iu.test(after)) {
    units.add('PERCENT');
  }
  if (/^\s*puntos?\b(?!\s+porcentuales?\b)/iu.test(after)) units.add('POINTS');
  if (/^\s*(?:millones?|mm)\b/u.test(after)) units.add('MILLION');
  if (/^\s*mil\b/iu.test(after)) units.add('THOUSAND');
  if (/(?:^|[\s/])(?:por\s+)?(?:litros?|l)\b/iu.test(after.slice(0, 40))) units.add('LITRE');
  if (/(?:^|\s)(?:toneladas?|t)\b/iu.test(after.slice(0, 40))) units.add('TONNE');
  if (/^\s*(?:mwh|mw|kwh)\b/iu.test(after)) units.add('ENERGY');
  return units;
}

function numericOccurrences(value: string): NumericOccurrence[] {
  const occurrences: NumericOccurrence[] = [];
  for (const match of value.matchAll(/(?<![\p{L}\p{N}])[+-]?\d+(?:[.,]\d+)*/gu)) {
    const raw = match[0];
    const start = match.index;
    occurrences.push({
      raw,
      comparable: comparableNumber(raw),
      units: contextualUnits(value, start, start + raw.length),
    });
  }
  return occurrences;
}

/** Returns figures whose value and stated unit do not occur together in the evidence. */
export function ungroundedNumbers(assertion: string, sourceText: string): string[] {
  const evidence = numericOccurrences(sourceText);
  const unsupported = numericOccurrences(assertion)
    .filter((claimed) =>
      evidence.every(
        (found) =>
          found.comparable !== claimed.comparable ||
          [...claimed.units].some((unit) => !found.units.has(unit)),
      ),
    )
    .map(({ raw }) => raw);
  return [...new Set(unsupported)];
}
