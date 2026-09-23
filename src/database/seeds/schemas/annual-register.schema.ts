import { z } from 'zod';

/**
 * Una serie anual que pertenece a algo: un departamento, una empresa, un
 * ranking.
 *
 * Los cuatro archivos que usan esta forma —las cuentas regionales, las
 * exportaciones por departamento y producto, el orden de las exportadoras y los
 * monitores de reputación— tienen el mismo problema y por eso comparten
 * esquema. Cada uno es un cuadro de dos entradas: una dimensión que el corpus
 * no tenía (dónde, quién) cruzada con los años. La vista anual del observatorio
 * archiva por `indicator_code` y no tiene columna para esa dimensión, así que
 * la dimensión va dentro del código —`DEPT_GDP_CONSTANT_POTOSI`— y `group` la
 * repite aquí en claro.
 *
 * Eso no es redundancia. Aguas abajo hay un tablero que agrupa por
 * departamento y otro que ordena por empresa, y ninguno de los dos debería
 * tener que partir cadenas de texto para saber a quién pertenece una fila: el
 * día que un departamento nuevo entre con un guion bajo en el nombre, el que
 * parte cadenas se rompe y el que lee `group` no.
 *
 * `level` dice si una fila se puede sumar con sus hermanas. El cuadro del INE
 * trae a Bolivia en la misma columna que sus nueve departamentos y el de
 * exportaciones trae el total del país encima de los bloques que lo componen;
 * quien sume todo lo que comparte prefijo contaría el país dos veces. Es la
 * misma decisión que `level` en las partidas arancelarias, y por la misma razón
 * viaja con el dato y no con el dibujo.
 *
 * `basis` es la línea que el cuadro imprime bajo su título —«en miles de
 * bolivianos de 1990», «peso neto en toneladas»— y viaja porque sin ella dos
 * series de PIB del mismo departamento se ven iguales y no lo son.
 *
 * La procedencia va en el punto y no en la serie, como en `mineral-trade`: una
 * descarga trae el cuadro entero, así que diez series citan el mismo archivo y
 * la misma huella, y el sembrador concilia el artefacto por esa huella para que
 * la descarga entre una vez y no diez.
 */

const measuredValue = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/u, 'lo declarado es una cantidad sin exponente');

export const annualRegisterSchema = z.object({
  series: z
    .array(
      z
        .object({
          indicatorCode: z
            .string()
            .regex(/^(?:DEPT|EXPORTER|REPUTATION)_[A-Z0-9_]+$/u)
            .max(80),
          /** El nombre completo que se lee en una leyenda o en una tabla. */
          name: z.string().trim().min(3).max(200),
          /** A quién pertenece la serie: el departamento, la empresa, el ranking. */
          group: z
            .string()
            .regex(/^[A-Z0-9_]+$/u)
            .max(60),
          /** Ese mismo, escrito como un lector lo reconoce. */
          groupLabel: z.string().trim().min(1).max(120),
          /** Qué se mide, sin el nombre del grupo. */
          measure: z.string().trim().min(3).max(120),
          /** Si la fila se puede sumar con sus hermanas, y en qué plano vive. */
          level: z.enum(['COUNTRY', 'DEPARTMENT', 'PRODUCT', 'COMPANY', 'AGGREGATE', 'ACTIVITY']),
          unit: z
            .string()
            .regex(/^[A-Z0-9_]+$/u)
            .max(30),
          /** La nota de base que el cuadro imprime bajo su título. */
          basis: z.string().trim().min(3).max(300),
          publisher: z.string().trim().min(2).max(200),
          frequency: z.literal('ANNUAL'),
          points: z
            .array(
              z
                .object({
                  period: z.string().regex(/^(19|20)\d{2}$/u),
                  value: measuredValue,
                  /** La celda de la que salió esta cifra, y sólo ella. */
                  excerpt: z.string().min(10).max(4_000),
                  sourceUrl: z.url(),
                  upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
                  retrievedAt: z.iso.datetime({ offset: false }),
                })
                .strict(),
            )
            .min(1)
            .max(120),
        })
        .strict(),
    )
    .min(1)
    .max(400),
});

export type AnnualRegister = z.infer<typeof annualRegisterSchema>;
export type AnnualRegisterSeries = AnnualRegister['series'][number];
