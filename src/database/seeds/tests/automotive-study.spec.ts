import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { automotiveStudySchema } from '../schemas/automotive-study.schema';

const study = JSON.parse(
  readFileSync(join(__dirname, '../boot/automotive-study.json'), 'utf8'),
) as Record<string, unknown>;

describe('evidencia del estudio automotor', () => {
  it('valida el conjunto publicado y sus capturas', () => {
    expect(automotiveStudySchema.parse(study).offers.length).toBeGreaterThan(60);
  });
  it('rechaza un precio sin fuente y una comparación B habilitada para brecha', () => {
    const parsed = automotiveStudySchema.parse(study);
    expect(() =>
      automotiveStudySchema.parse({
        ...parsed,
        offers: [{ ...parsed.offers[0], sourceId: 'inexistente' }],
      }),
    ).toThrow();
    expect(() =>
      automotiveStudySchema.parse({
        ...parsed,
        comparisons: [{ ...parsed.comparisons[0], grade: 'B', directGapAllowed: true }],
      }),
    ).toThrow();
  });
  it('rechaza una captura fallida usada para sostener un precio', () => {
    const parsed = automotiveStudySchema.parse(study);
    expect(() =>
      automotiveStudySchema.parse({
        ...parsed,
        sources: parsed.sources.map((s) => ({ ...s, httpStatus: 403 })),
      }),
    ).toThrow();
  });
});
