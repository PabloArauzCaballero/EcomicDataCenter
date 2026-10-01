import {
  articleReadingView,
  fillFunction,
  functions,
  termReadingView,
} from '../migration-sql/0093-read-each-press-note-once.view';
import { readPressNotes } from '../press-readings';

describe('readPressNotes', () => {
  it('repeats the batch until none is left and adds them up', async () => {
    const batches = [1000, 1000, 217, 0];
    const runBatch = jest.fn(async () => batches.shift() ?? 0);
    const progress = jest.fn();

    await expect(readPressNotes(runBatch, progress)).resolves.toBe(2217);

    expect(runBatch).toHaveBeenCalledTimes(4);
    expect(progress).toHaveBeenLastCalledWith(2217);
  });

  it('does nothing on a database that has not reached the migration', async () => {
    const missing = Object.assign(new Error('function does not exist'), {
      parent: { code: '42883' },
    });

    await expect(readPressNotes(async () => Promise.reject(missing))).resolves.toBe(0);
  });

  it('does not swallow any other failure', async () => {
    const broken = Object.assign(new Error('canceling statement'), { parent: { code: '57014' } });

    await expect(readPressNotes(async () => Promise.reject(broken))).rejects.toBe(broken);
  });
});

describe('migration 0093 SQL', () => {
  it('builds the classifier from the 0071 lexicon: 48 rule lists, three defaults', () => {
    expect(functions.match(/~ ANY \(ARRAY\[/g)).toHaveLength(48);
    for (const fallback of ["'OTROS'", "'NEUTRO'", "'NACIONAL'"]) {
      expect(functions).toContain(fallback);
    }
  });

  it('builds the term lookup from the 0078 vocabulary: 140 terms', () => {
    const hits = functions.slice(functions.indexOf('press_term_hits(searchable'));
    expect(hits.match(/^ {4}\('[A-Z_]+',/gm)).toHaveLength(140);
  });

  it('keeps the article view columns in the order the stored copy was built with', () => {
    const view = articleReadingView();
    const order = ['published.*', 'AS topic', 'AS tone', 'AS region'].map((part) =>
      view.indexOf(part),
    );

    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(view).not.toContain('~ ANY');
  });

  it('keeps the term view columns in the order the stored copy was built with', () => {
    const columns = [
      'hit.term',
      'hit.label',
      'hit.family',
      'article.fact_claim_id',
      'article.region',
    ];
    const positions = columns.map((column) => termReadingView.indexOf(column));

    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(termReadingView).not.toContain('~ ANY');
  });

  it('reads a batch at a time and never more than asked', () => {
    expect(fillFunction).toContain('LIMIT batch_size');
    expect(fillFunction).toContain('SECURITY DEFINER');
  });
});
