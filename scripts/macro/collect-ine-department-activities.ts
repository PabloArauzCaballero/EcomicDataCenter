import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLISHER } from './department-sources';
import {
  ACTIVITY_MEASURES,
  DEPARTMENT_ACTIVITY_TABLES,
  NATIONAL_ACTIVITY_TABLES,
  activitiesOf,
  activityCode,
  activityTable,
  type ActivityMeasure,
  type ActivityTables,
} from './department-activity-sources';
import { download, firstSheet, normalized, pointsOf, sleep, yearColumns } from './ine-workbook';
import { countPoints, type RegisterSeries } from './annual-register-shape';
import { Workbook, type SheetRow } from './xlsx-cells';

/**
 * Recoge de qué vive cada departamento, actividad por actividad.
 *
 * Treinta descargas: los nueve departamentos y el país, cada uno en tres
 * medidas —el nivel a precios constantes, su variación y el reparto—. Cada
 * cuaderno es un cuadro cruzado de actividades por años, así que una descarga
 * rinde treinta y cuatro series de una vez y `department-activity-catalogue`
 * explica cuáles y en qué plano vive cada una.
 *
 * El colector es deliberadamente frágil, por lo mismo que el de las cuentas
 * regionales: si una fila declarada deja de estar, la corrida se detiene con su
 * nombre en el mensaje. Una nomenclatura que cambia en silencio es una serie
 * que deja de actualizarse sin que nadie lo note, y eso cuesta mucho más que
 * una corrida rota.
 *
 * **Un archivo por medida y no uno solo.** El esquema del registro anual admite
 * cuatrocientas series por archivo y aquí son más de mil; partirlas por medida
 * deja tres archivos de tamaño parejo, cada uno con las diez filas de una misma
 * pregunta. Partirlas por departamento habría dado diez archivos que nadie
 * puede leer sin abrir los diez.
 *
 * Se corre con `yarn departments:activities`.
 */

const SEED_DIRECTORY = join('src', 'database', 'seeds', 'boot');

const seedPath = (measure: ActivityMeasure): string =>
  join(SEED_DIRECTORY, `department-activities-${measure.slug.toLowerCase()}.json`);

/** Las filas del cuaderno, buscables por el rótulo que el INE les puso. */
function byLabel(rows: readonly SheetRow[]): Map<string, SheetRow> {
  const found = new Map<string, SheetRow>();
  for (const row of rows) {
    const [first] = [...row.values()];
    if (first === undefined) continue;
    const key = normalized(first);
    if (key.length && !found.has(key)) found.set(key, row);
  }
  return found;
}

/** Lo que un lugar publica de una medida: sus treinta y cuatro filas. */
async function collectPlace(
  tables: ActivityTables,
  measure: ActivityMeasure,
  index: number,
  retrievedAt: string,
): Promise<RegisterSeries[]> {
  const table = activityTable(tables, measure);
  const share = tables.shares[index];
  if (share === undefined) throw new Error(`cuadro ${table}: no hay enlace declarado`);

  const { bytes, url } = await download(share, `cuadro ${table}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sheet = firstSheet(new Workbook(bytes));
  const rows = byLabel(sheet);
  const columns = yearColumns(sheet, 'ACTIVIDAD');

  const series: RegisterSeries[] = [];
  for (const activity of activitiesOf(tables.place)) {
    const row = rows.get(normalized(activity.row));
    if (!row) throw new Error(`cuadro ${table}: falta la fila «${activity.row}»`);

    const points = pointsOf(
      row,
      columns,
      { cuadro: table, lugar: tables.name, actividad: activity.row },
      { url, sha256, retrievedAt },
    );
    if (!points.length) continue;

    series.push({
      indicatorCode: activityCode(measure.slug, tables.place, activity.slug),
      name: `${activity.name} en ${tables.name}: ${measure.measure.toLocaleLowerCase('es')}`,
      group: tables.place,
      groupLabel: tables.name,
      /*
       * La medida lleva el plano dentro. Un grupo y una de sus ramas se miden
       * igual y no se suman igual, y quien lea la observación cruda sin el
       * tablero delante no tiene otro sitio donde enterarse: `level` en este
       * esquema dice de quién es la fila —del departamento— y no en qué escalón
       * del cuadro vive.
       */
      measure: `${measure.measure} · ${activity.level}`,
      level: 'ACTIVITY',
      unit: measure.unit,
      basis: measure.basis,
      publisher: PUBLISHER,
      frequency: 'ANNUAL',
      points,
    });
  }

  console.log(`  ${table.padEnd(9)} ${tables.name.padEnd(12)} ${series.length} filas`);
  return series;
}

function write(path: string, series: readonly RegisterSeries[]): void {
  writeFileSync(path, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  console.log(`  -> ${path}: ${series.length} series, ${countPoints(series)} observaciones`);
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  const places = [...DEPARTMENT_ACTIVITY_TABLES, NATIONAL_ACTIVITY_TABLES];

  for (const [index, measure] of ACTIVITY_MEASURES.entries()) {
    console.log(`\n${measure.measure}`);
    const series: RegisterSeries[] = [];
    for (const tables of places) {
      series.push(...(await collectPlace(tables, measure, index, retrievedAt)));
      await sleep(1_200);
    }
    write(seedPath(measure), series);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'la recolección por actividad falló'}\n`,
  );
  process.exitCode = 1;
});
