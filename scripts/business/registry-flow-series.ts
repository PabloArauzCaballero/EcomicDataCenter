import { SeriesBook } from './business-common';
import type { RegisterSeries } from '../macro/annual-register-shape';
import { DEPARTMENTS } from './business-common';
import { keyLabel } from './registry-flow-keys';
import { FUNDEMPRESA, type Measure } from './registry-flow-sources';

/**
 * De las lecturas sueltas a las series: qué cifra gana cuando dos documentos
 * dan el mismo año, y cómo se llama y se explica cada serie.
 */

export type FlowDimension =
  'TOTAL' | 'DEPT' | 'FORM' | 'CIIU' | 'CIIU3' | 'DEPTCIIU' | 'DEPTCIIU3' | 'MUNI' | 'GROUP';

/** Una cifra leída, con el documento que la trae y cuánto vale frente a otras del mismo año. */
export interface Candidate {
  readonly measure: Measure;
  readonly dimension: FlowDimension;
  readonly key: string;
  readonly label?: string;
  readonly year: string;
  readonly value: string;
  readonly excerpt: string;
  readonly sourceUrl: string;
  readonly sha256: string;
  readonly retrievedAt: string;
  readonly publisher: string;
  /** Menor gana: el reporte del propio año antes que el que la trae de arrastre. */
  readonly rank: number;
  /** Los meses, si la cifra no cubre la gestión entera. */
  readonly months?: string;
  /** Lo que la nota de base tiene que decir de esta cifra en particular. */
  readonly note?: string;
}

const MEASURES: Readonly<Record<Measure, { readonly label: string; readonly basis: string }>> = {
  NEW: {
    label: 'empresas inscritas (nuevas matrículas)',
    basis: 'Empresas que se inscriben por primera vez en el Registro de Comercio en la gestión; flujo del año, no stock',
  },
  RENEWED: {
    label: 'matrículas actualizadas (renovadas)',
    basis: 'Empresas con su matrícula de comercio actualizada o renovada en la gestión, al cierre de diciembre; no es la base vigente ni el número de trámites',
  },
  CANCELLED: {
    label: 'matrículas canceladas',
    basis: 'Matrículas de comercio canceladas (cierre de empresas) en la gestión; flujo del año, no stock',
  },
  ACTIVE: {
    label: 'base empresarial activa',
    basis: '«Base Empresarial» de los reportes hasta 2011: matrícula vigente o actualizada en la gestión más las nuevas; no es la Base Empresarial Vigente (todas las no canceladas)',
  },
};

const DIMENSION_NOTES: Readonly<Record<FlowDimension, string>> = {
  TOTAL: '',
  DEPT: '',
  FORM: '',
  CIIU: '. Secciones CAEB 2011',
  CIIU3: '. Secciones CIIU rev. 3, no comparables con las CAEB 2011',
  DEPTCIIU: '. Departamento por sección CAEB 2011',
  DEPTCIIU3: '. Departamento por sección CIIU rev. 3, no comparable con la CAEB 2011',
  MUNI: '. Sólo los municipios que el reporte nombra en su texto',
  GROUP: '. Periodo de renovación según el tipo de unidad (SEPREC)',
};

const LEVELS: Readonly<Record<FlowDimension, string>> = {
  TOTAL: 'COUNTRY',
  DEPT: 'DEPARTMENT',
  FORM: 'LEGAL_FORM',
  CIIU: 'ACTIVITY',
  CIIU3: 'ACTIVITY',
  DEPTCIIU: 'ACTIVITY',
  DEPTCIIU3: 'ACTIVITY',
  // Una lista parcial de municipios no se suma con nada: es un agregado, no un reparto.
  MUNI: 'AGGREGATE',
  GROUP: 'ACTIVITY',
};

/** La cifra que gana en cada serie y año, y cuántos años tenían lecturas distintas entre documentos. */
export function resolve(candidates: readonly Candidate[]): { chosen: Candidate[]; disagreements: string[] } {
  const best = new Map<string, Candidate>();
  const all = new Map<string, Candidate[]>();
  for (const one of candidates) {
    const id = `${codeFor(one)}|${one.year}`;
    all.set(id, [...(all.get(id) ?? []), one]);
    const current = best.get(id);
    if (!current || one.rank < current.rank) best.set(id, one);
  }
  const disagreements = [...all]
    .filter(([, list]) => new Set(list.map((one) => one.value)).size > 1)
    .map(([id, list]) => `${id}: ${list.map((one) => `${one.value}@${one.rank}`).join(' / ')}`);
  return { chosen: [...best.values()], disagreements };
}

export function codeFor(one: Pick<Candidate, 'measure' | 'dimension' | 'key'>): string {
  return `FIRMS_${one.measure}_${one.dimension}_${one.key === 'BOLIVIA' && one.dimension === 'TOTAL' ? 'BOLIVIA' : one.key}`;
}

function groupOf(one: Candidate): { group: string; groupLabel: string } {
  if (one.dimension === 'DEPTCIIU' || one.dimension === 'DEPTCIIU3') {
    const [dept = '', section = ''] = one.key.split('__');
    const sections = one.dimension === 'DEPTCIIU' ? 'CIIU' : 'CIIU3';
    return { group: `${sections}_${one.key}`, groupLabel: `${DEPARTMENTS[dept] ?? dept} · ${keyLabel(sections, section)}` };
  }
  if (one.dimension === 'MUNI' || one.dimension === 'GROUP') {
    return { group: `${one.dimension}_${one.key}`, groupLabel: one.label ?? one.key };
  }
  const prefix = one.dimension === 'CIIU' || one.dimension === 'CIIU3' ? `${one.dimension}_` : '';
  return { group: `${prefix}${one.key}`, groupLabel: keyLabel(one.dimension, one.key) };
}

/** Quién publica: uno de los dos, o los dos con el año del relevo. */
function publisherOf(points: readonly Candidate[]): string {
  const names = new Set(points.map((one) => one.publisher));
  if (names.size === 1) return [...names][0] ?? FUNDEMPRESA;
  return 'FUNDEMPRESA (hasta marzo de 2022) y SEPREC (desde abril de 2022)';
}

/** La nota de base, con los años que no cubren la gestión entera. */
function basisOf(measure: Measure, dimension: FlowDimension, points: readonly Candidate[]): string {
  const partial = points.filter((one) => one.months).map((one) => `${one.year}: ${one.months}`);
  const relay = new Set(points.map((one) => one.publisher)).size > 1 ? '. Hasta 2021 FUNDEMPRESA, desde 2022 SEPREC' : '';
  const months = partial.length ? `. Años parciales: ${partial.join('; ')}` : '';
  const notes = [...new Set(points.flatMap((one) => (one.note ? [`. ${one.note}`] : [])))].join('');
  return `${MEASURES[measure].basis}${DIMENSION_NOTES[dimension]}${relay}${months}${notes}.`;
}

export function buildSeries(chosen: readonly Candidate[]): RegisterSeries[] {
  const byCode = new Map<string, Candidate[]>();
  for (const one of chosen) byCode.set(codeFor(one), [...(byCode.get(codeFor(one)) ?? []), one]);
  const book = new SeriesBook();
  for (const [code, points] of byCode) {
    const head = points[0];
    if (!head) continue;
    const { group, groupLabel } = groupOf(head);
    const measure = MEASURES[head.measure].label;
    const partial = points.some((one) => one.months) ? ' (con años parciales)' : '';
    for (const one of points) {
      book.add(
        {
          indicatorCode: code,
          name: `${groupLabel}: ${measure}${partial}`,
          group,
          groupLabel,
          measure: `${measure}${partial}`,
          level: LEVELS[head.dimension] as RegisterSeries['level'],
          unit: 'COUNT',
          basis: basisOf(head.measure, head.dimension, points),
          publisher: publisherOf(points),
        },
        {
          period: one.year,
          value: one.value,
          excerpt: one.excerpt,
          sourceUrl: one.sourceUrl,
          upstreamSha256: one.sha256,
          retrievedAt: one.retrievedAt,
        },
      );
    }
  }
  return book.all().sort((left, right) => left.indicatorCode.localeCompare(right.indicatorCode));
}

