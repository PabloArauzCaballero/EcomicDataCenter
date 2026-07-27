import {
  belongsToSameStory,
  clusterFingerprint,
  contentTokens,
  shingles,
  similarity,
} from '../document-similarity';

const WIRE_STORY =
  'El Banco Central de Bolivia informó que las reservas internacionales netas ' +
  'alcanzaron 2.150 millones de dólares en junio, un incremento de 3,2 por ciento ' +
  'respecto al mes anterior según el boletín estadístico oficial publicado el martes.';

const REPRINTED_WITH_NEW_LEAD =
  'Según el boletín estadístico oficial publicado el martes, el Banco Central de Bolivia ' +
  'informó que las reservas internacionales netas alcanzaron 2.150 millones de dólares ' +
  'en junio, un incremento de 3,2 por ciento respecto al mes anterior.';

const UNRELATED_STORY =
  'La producción de soya en Santa Cruz cayó 12 por ciento durante la campaña de verano ' +
  'debido a la sequía prolongada que afectó a los municipios del norte integrado, ' +
  'informaron los productores agrupados en la cámara agropecuaria del oriente.';

describe('contentTokens', () => {
  it('drops function words that carry no discriminating signal', () => {
    expect(contentTokens('el banco de la republica')).toEqual(['banco', 'republica']);
  });

  it('folds accents so outlets that strip them still align', () => {
    expect(contentTokens('inflación mensual')).toEqual(contentTokens('inflacion mensual'));
  });

  it('returns nothing for text made only of stop words', () => {
    expect(contentTokens('el la de y por')).toEqual([]);
  });
});

describe('similarity', () => {
  it('scores a text against itself as identical', () => {
    expect(similarity(shingles(WIRE_STORY), shingles(WIRE_STORY))).toBe(1);
  });

  it('scores unrelated economic stories as far apart', () => {
    expect(similarity(shingles(WIRE_STORY), shingles(UNRELATED_STORY))).toBeLessThan(0.2);
  });

  it('returns zero when either side has no content words', () => {
    expect(similarity(shingles('el la de'), shingles(WIRE_STORY))).toBe(0);
  });
});

describe('belongsToSameStory', () => {
  it('recognises the same wire item reprinted with a reordered lead', () => {
    expect(belongsToSameStory(WIRE_STORY, REPRINTED_WITH_NEW_LEAD)).toBe(true);
  });

  it('keeps genuinely different stories apart', () => {
    expect(belongsToSameStory(WIRE_STORY, UNRELATED_STORY)).toBe(false);
  });

  it('is symmetric', () => {
    expect(belongsToSameStory(WIRE_STORY, UNRELATED_STORY)).toBe(
      belongsToSameStory(UNRELATED_STORY, WIRE_STORY),
    );
  });
});

describe('clusterFingerprint', () => {
  it('is stable for the same text', () => {
    expect(clusterFingerprint(WIRE_STORY)).toBe(clusterFingerprint(WIRE_STORY));
  });

  it('produces a hexadecimal digest the column constraint accepts', () => {
    expect(clusterFingerprint(WIRE_STORY)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('separates unrelated stories into different buckets', () => {
    expect(clusterFingerprint(WIRE_STORY)).not.toBe(clusterFingerprint(UNRELATED_STORY));
  });

  it('still yields a fingerprint for very short text', () => {
    expect(clusterFingerprint('inflación')).toMatch(/^[a-f0-9]{64}$/u);
  });
});
