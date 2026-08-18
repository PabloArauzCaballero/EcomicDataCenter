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

function scaleComparableNumber(value: string, decimalPower: number): string {
  if (decimalPower === 0) return value;
  const negative = value.startsWith('-');
  const unsigned = value.replace(/^-/, '');
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/u, '') || '0';
  const remainingDecimalPlaces = fraction.length - decimalPower;
  let scaled: string;
  if (remainingDecimalPlaces <= 0) {
    scaled = `${digits}${'0'.repeat(-remainingDecimalPlaces)}`;
  } else {
    const padded = digits.padStart(remainingDecimalPlaces + 1, '0');
    const split = padded.length - remainingDecimalPlaces;
    const scaledWhole = padded.slice(0, split).replace(/^0+(?=\d)/u, '');
    const scaledFraction = padded.slice(split).replace(/0+$/u, '');
    scaled = scaledFraction ? `${scaledWhole}.${scaledFraction}` : scaledWhole;
  }
  return negative && !/^0(?:\.0*)?$/u.test(scaled) ? `-${scaled}` : scaled;
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
    const units = contextualUnits(value, start, start + raw.length);
    const decimalPower = units.has('MILLION') ? 6 : units.has('THOUSAND') ? 3 : 0;
    units.delete('MILLION');
    units.delete('THOUSAND');
    occurrences.push({
      raw,
      comparable: scaleComparableNumber(comparableNumber(raw), decimalPower),
      units,
    });
  }
  return occurrences;
}

function occurrencesMatch(claimed: NumericOccurrence, found: NumericOccurrence): boolean {
  return (
    found.comparable === claimed.comparable &&
    [...claimed.units].every((unit) => found.units.has(unit))
  );
}

/** Returns figures that cannot map to distinct, ordered evidence occurrences with their units. */
export function ungroundedNumbers(assertion: string, sourceText: string): string[] {
  const evidence = numericOccurrences(sourceText);
  const unsupported: string[] = [];
  let evidenceCursor = 0;
  for (const claimed of numericOccurrences(assertion)) {
    const relativeIndex = evidence
      .slice(evidenceCursor)
      .findIndex((found) => occurrencesMatch(claimed, found));
    if (relativeIndex < 0) unsupported.push(claimed.raw);
    else evidenceCursor += relativeIndex + 1;
  }
  return [...new Set(unsupported)];
}
