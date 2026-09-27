import { COLLECTION_RULES } from '../collection-rules';
import { judge } from '../quality-evaluation.service';

describe('judge', () => {
  /**
   * The line that matters most in this module: a rule that looked at nothing
   * has not passed. Reporting «0 de 0» as a hundred per cent would hide exactly
   * the datasets nobody is collecting.
   */
  it('reports NOT_EVALUATED when there is no population', () => {
    expect(judge({ numerator: 0, denominator: 0, notEvaluated: 12 }, 'ERROR')).toBe(
      'NOT_EVALUATED',
    );
  });

  it('passes only when every row in the population complied', () => {
    expect(judge({ numerator: 10, denominator: 10, notEvaluated: 0 }, 'ERROR')).toBe('PASS');
  });

  it('warns on a near miss whatever the severity', () => {
    expect(judge({ numerator: 99, denominator: 100, notEvaluated: 0 }, 'ERROR')).toBe('WARNING');
    expect(judge({ numerator: 99, denominator: 100, notEvaluated: 0 }, 'WARNING')).toBe('WARNING');
  });

  it('fails a blocking rule that falls below the bar', () => {
    expect(judge({ numerator: 8, denominator: 10, notEvaluated: 0 }, 'ERROR')).toBe('FAIL');
    expect(judge({ numerator: 8, denominator: 10, notEvaluated: 0 }, 'CRITICAL')).toBe('FAIL');
  });

  it('keeps a non-blocking rule below the bar as a warning', () => {
    expect(judge({ numerator: 8, denominator: 10, notEvaluated: 0 }, 'WARNING')).toBe('WARNING');
    expect(judge({ numerator: 0, denominator: 10, notEvaluated: 0 }, 'INFO')).toBe('WARNING');
  });
});

describe('collection rules', () => {
  it('declares unique codes', () => {
    const codes = COLLECTION_RULES.map((rule) => rule.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every rule returns the three columns the register stores', () => {
    for (const rule of COLLECTION_RULES) {
      expect(rule.sql).toContain('AS numerator');
      expect(rule.sql).toContain('AS denominator');
      expect(rule.sql).toContain('AS not_evaluated');
    }
  });

  /**
   * A rule whose statement carried an interpolation would be a statement a
   * caller could influence. None of them takes a parameter at all.
   */
  it('no rule statement interpolates anything', () => {
    for (const rule of COLLECTION_RULES) {
      expect(rule.sql).not.toMatch(/\$\{/u);
      expect(rule.sql).not.toMatch(/:[a-zA-Z]/u);
    }
  });

  it('labels the textual-support rule as support and not as truth', () => {
    const rule = COLLECTION_RULES.find((entry) => entry.code === 'CLAIM_TEXTUAL_SUPPORT');
    expect(rule?.name).toContain('respaldo textual');
    expect(rule?.name).toContain('no verdad');
  });
});
