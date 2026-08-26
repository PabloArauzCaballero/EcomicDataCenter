import { NAMES, SPELLING } from './headline-vocabulary';

/**
 * Puts the accents back into a headline recovered from a web address.
 *
 * A news slug is the headline with its accents stripped and its spaces turned
 * to hyphens, so recovering the words is easy and recovering the spelling is
 * not: Spanish accent placement depends on meaning as often as on form —
 * `publico`, `público` and `publicó` are three different words spelled the same
 * without them.
 *
 * So this does not guess. It maps a vocabulary of words this corpus actually
 * uses, and leaves anything outside it alone. A headline it cannot fully
 * restore reads slightly wrong; a headline it guessed at would read confidently
 * wrong, which is worse in a report whose whole claim is that you can check it.
 *
 * Ambiguous forms are deliberately absent. `publico` stays as it is rather than
 * becoming the wrong one of its three readings.
 */

/**
 * Endings whose stress Spanish fixes by rule rather than by meaning.
 *
 * These are not guesses. A noun ending in `-cion` or `-sion` takes the accent on
 * its final syllable without exception; the `-ico` families below are
 * esdrújulas, which are always written with one. Applying them recovers
 * thousands of words a vocabulary list would never finish enumerating.
 *
 * What is deliberately absent is the verb endings. `-ara`, `-era` and `-iran`
 * are future in one reading and past subjunctive in another — `acordara` and
 * `acordará` are different tenses of a real sentence — and no rule decides
 * which a headline meant. Those stay as they are.
 */
const ENDINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/cion$/u, 'ción'],
  [/sion$/u, 'sión'],
  [/xion$/u, 'xión'],
  [/logia$/u, 'logía'],
  [/nomia$/u, 'nomía'],
  [/grafia$/u, 'grafía'],
  [/rquia$/u, 'rquía'],
  [/aceutic([oa]s?)$/u, 'acéutic$1'],
  [/istic([oa]s?)$/u, 'ístic$1'],
  [/ific([oa]s?)$/u, 'ífic$1'],
  [/ogic([oa]s?)$/u, 'ógic$1'],
  [/omic([oa]s?)$/u, 'ómic$1'],
  [/imic([oa]s?)$/u, 'ímic$1'],
  [/itic([oa]s?)$/u, 'ític$1'],
  [/etic([oa]s?)$/u, 'étic$1'],
  [/atic([oa]s?)$/u, 'átic$1'],
  [/actic([oa]s?)$/u, 'áctic$1'],
  [/edic([oa]s?)$/u, 'édic$1'],
];

/** The spelling a rule gives a word, or the word when no rule claims it. */
function byRule(word: string): string {
  // A word that already carries an accent has been spelled by someone.
  if (/[áéíóúü]/u.test(word)) return word;
  for (const [pattern, replacement] of ENDINGS) {
    if (pattern.test(word)) return word.replace(pattern, replacement);
  }
  return word;
}

/** Junk a slug carries that was never part of a headline. */
const JUNK = /^(?:\d{6,}|[a-f0-9]{16,}|img|foto|image|photo|copia|final|v\d+)$/iu;

/**
 * The headline a web address spells out, with the spelling this corpus knows.
 *
 * Returns null when what is left does not read like a headline — too few words,
 * or nothing but identifiers — because a row nobody can read is worse than a
 * row that is not there.
 */
export function readableHeadline(slug: string): string | null {
  const words = slug
    .split(/[-_\s]+/u)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 0 && !JUNK.test(word));
  if (words.length < 4) return null;

  const spelled = words.map((word) => SPELLING[word] ?? byRule(word));
  let text = spelled.join(' ');

  // Multi-word names first, so "santa cruz" wins over "santa" and "cruz".
  for (const [plain, proper] of Object.entries(NAMES)) {
    if (!plain.includes(' ')) continue;
    text = text.replace(new RegExp(`\\b${plain}\\b`, 'giu'), proper);
  }
  text = text
    .split(' ')
    .map((word) => NAMES[word.toLowerCase()] ?? word)
    .join(' ');

  const letters = text.replace(/[^a-záéíóúñü]/giu, '');
  if (letters.length < 15) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
