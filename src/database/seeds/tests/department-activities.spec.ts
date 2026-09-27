import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { annualRegisterSchema } from '../schemas/annual-register.schema';

/**
 * Guards the departmental economy opened by activity.
 *
 * What would quietly ruin these three files is not a wrong number: it is a row
 * that stops arriving. The INE publishes eleven activities per department and
 * the collector asks for them by name, so a renamed row fails loudly — but a
 * row that arrives for eight departments and not for the ninth would leave one
 * economy drawn with a hole in it and nothing red anywhere.
 *
 * So the tests hold the shape, which is fixed, and not the values, which move
 * every year: every place brings every group, the parts add up to the whole the
 * INE publishes beside them, and the country's rows use the same activity slugs
 * as a department's — the one property the chapter's comparisons rest on.
 */

const PLACES = [
  'CHUQUISACA',
  'LA_PAZ',
  'COCHABAMBA',
  'ORURO',
  'POTOSI',
  'TARIJA',
  'SANTA_CRUZ',
  'BENI',
  'PANDO',
] as const;

/** Los once grupos del cuadro departamental, en el orden del INE. */
const GROUPS = [
  'AGRICULTURA',
  'MINAS_Y_CANTERAS',
  'MANUFACTURA',
  'ELECTRICIDAD_GAS_Y_AGUA',
  'CONSTRUCCION',
  'COMERCIO',
  'TRANSPORTE_Y_COMUNICACIONES',
  'FINANZAS_Y_EMPRESAS',
  'SERVICIOS_COMUNALES',
  'RESTAURANTES_Y_HOTELES',
  'ADMINISTRACION_PUBLICA',
] as const;

const load = async (measure: string) =>
  annualRegisterSchema.parse(
    JSON.parse(
      await readFile(
        join(__dirname, '..', 'boot', `department-activities-${measure}.json`),
        'utf8',
      ),
    ),
  );

const codeOf = (measure: string, place: string, activity: string): string =>
  `DEPT_ACT_${measure}_${place}_${activity}`;

const at = (
  series: { points: ReadonlyArray<{ period: string; value: string }> },
  year: string,
): number | null => {
  const point = series.points.find((one) => one.period === year);
  return point ? Number(point.value) : null;
};

describe('departmental product by economic activity', () => {
  it('brings the eleven activities for every one of the nine departments', async () => {
    const { series } = await load('value');
    const codes = new Set(series.map((one) => one.indicatorCode));

    for (const place of PLACES) {
      for (const group of GROUPS) {
        expect(codes.has(codeOf('VALUE', place, group))).toBe(true);
      }
    }
  });

  it('files no activity twice under the same place', async () => {
    for (const measure of ['value', 'growth', 'share']) {
      const { series } = await load(measure);
      const codes = series.map((one) => one.indicatorCode);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  /*
   * La comprobación que de verdad ata las filas entre sí. El INE publica el
   * total a precios básicos en la misma columna que sus partes, así que las
   * once más el ajuste bancario tienen que dar ese total; si una fila se
   * perdiera por el camino, la suma se quedaría corta y nadie lo notaría
   * mirando una figura.
   */
  it('adds its parts up to the basic-price total the INE prints beside them', async () => {
    const { series } = await load('value');
    const byCode = new Map(series.map((one) => [one.indicatorCode, one]));
    const year = '2024';

    for (const place of PLACES) {
      const parts = [...GROUPS, 'SERVICIOS_BANCARIOS_IMPUTADOS']
        .map((activity) => byCode.get(codeOf('VALUE', place, activity)))
        .map((one) => (one ? at(one, year) : null));
      expect(parts.every((part) => part !== null)).toBe(true);

      const whole = at(byCode.get(codeOf('VALUE', place, 'PIB_BASICO'))!, year);
      const added = parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
      expect(whole).not.toBeNull();
      // Una milésima del total: el cuadro guarda quince decimales y la suma de
      // doce de ellos arrastra el redondeo de la coma flotante, no un hueco.
      expect(Math.abs(added - (whole ?? 0))).toBeLessThan(Math.abs(whole ?? 1) / 1_000);
    }
  });

  /*
   * El cuadro de participación reparte sobre el producto **a precios de
   * mercado**, no sobre el valor agregado: por eso los once grupos no dan cien
   * sino la participación del producto a precios básicos, y el resto son los
   * impuestos indirectos. Quien dibuje estas cifras sin saberlo publica una
   * torta a la que le falta un sexto.
   */
  it('shares the market-price product, not the value added', async () => {
    const { series } = await load('share');
    const byCode = new Map(series.map((one) => [one.indicatorCode, one]));
    const year = '2024';

    for (const place of PLACES) {
      const basic = at(byCode.get(codeOf('SHARE', place, 'PIB_BASICO'))!, year) ?? 0;
      const taxes = at(byCode.get(codeOf('SHARE', place, 'IMPUESTOS_INDIRECTOS'))!, year) ?? 0;
      const market = at(byCode.get(codeOf('SHARE', place, 'PIB_MERCADO'))!, year) ?? 0;

      expect(market).toBeCloseTo(100, 6);
      expect(basic + taxes).toBeCloseTo(market, 6);
      expect(basic).toBeLessThan(market);
    }
  });

  /*
   * La propiedad de la que cuelgan todas las comparaciones del capítulo: el país
   * y un departamento tienen que nombrar igual la misma actividad. El cuadro
   * nacional abre más —separa carnes de lácteos donde el departamental dice
   * «Alimentos»— pero lo que comparten lo comparten con el mismo `slug`.
   */
  it('names an activity the same way in the country as in a department', async () => {
    const { series } = await load('value');
    const codes = new Set(series.map((one) => one.indicatorCode));
    const shared = [
      'PETROLEO_Y_GAS',
      'MINERALES',
      'COMERCIO',
      'CONSTRUCCION',
      'ELECTRICIDAD_GAS_Y_AGUA',
      'ADMINISTRACION_PUBLICA',
      'SERVICIOS_FINANCIEROS',
      'COMUNICACIONES',
    ];

    for (const activity of shared) {
      expect(codes.has(codeOf('VALUE', 'BOLIVIA', activity))).toBe(true);
      expect(codes.has(codeOf('VALUE', 'TARIJA', activity))).toBe(true);
    }
  });

  it('cites the INE workbook each figure came out of', async () => {
    const { series } = await load('growth');

    for (const one of series) {
      expect(one.publisher).toBe('INSTITUTO NACIONAL DE ESTADISTICA');
      expect(one.level).toBe('ACTIVITY');
      for (const point of one.points) {
        expect(point.sourceUrl).toMatch(/^https:\/\/nube\.ine\.gob\.bo\/index\.php\/s\//u);
        expect(point.excerpt).toContain(point.value);
      }
    }
  });
});
