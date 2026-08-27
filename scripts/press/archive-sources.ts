/**
 * What the collector asks the public archive for.
 *
 * Kept apart from the collector because it is a list of editorial decisions,
 * not of mechanism: which mastheads count as coverage of the Bolivian economy,
 * and which of their sections carry it. It grows whenever a year turns out to
 * be thinner than the years around it.
 */

export interface Source {
  readonly outlet: string;
  readonly domain: string;
  readonly pattern: string;
}

/**
 * What to ask the archive for, and why the list looks like this.
 *
 * The six outlets that only reach the report through a live feed had no archive
 * pattern at all, so the record before this year came from four mastheads while
 * this year came from eight — a reader comparing 2023 against 2026 was
 * comparing two different newspapers, not two different years. Every outlet the
 * collector reads now has a pattern here.
 *
 * The sections are the ones an economy is reported in: the business desk first,
 * then the national desk, because a fuel shortage or a blockade is filed under
 * "país" and lands on the economy days later. Broad patterns cost nothing —
 * anything the topic rules do not recognise stays under «Otros».
 *
 * LA RAZÓN moved from la-razon.com to larazon.bo; both are asked for, because
 * the archive holds what each domain published while it was the live one.
 */
export const SOURCES: readonly Source[] = [
  { outlet: 'EL DEBER', domain: 'eldeber.com.bo', pattern: 'eldeber.com.bo/economia/*' },
  { outlet: 'EL DEBER', domain: 'eldeber.com.bo', pattern: 'eldeber.com.bo/dinero/*' },
  { outlet: 'EL DEBER', domain: 'eldeber.com.bo', pattern: 'eldeber.com.bo/pais/*' },
  {
    outlet: 'LOS TIEMPOS',
    domain: 'lostiempos.com',
    pattern: 'lostiempos.com/actualidad/economia/*',
  },
  {
    outlet: 'LOS TIEMPOS',
    domain: 'lostiempos.com',
    pattern: 'lostiempos.com/actualidad/pais/*',
  },
  { outlet: 'OPINIÓN', domain: 'opinion.com.bo', pattern: 'opinion.com.bo/articulo/economia/*' },
  { outlet: 'OPINIÓN', domain: 'opinion.com.bo', pattern: 'opinion.com.bo/articulo/pais/*' },
  { outlet: 'PÁGINA SIETE', domain: 'paginasiete.bo', pattern: 'paginasiete.bo/economia/*' },
  { outlet: 'EL PAÍS', domain: 'elpais.bo', pattern: 'elpais.bo/economia/*' },
  { outlet: 'LA RAZÓN', domain: 'la-razon.com', pattern: 'la-razon.com/economia/*' },
  { outlet: 'LA RAZÓN', domain: 'larazon.bo', pattern: 'larazon.bo/economia/*' },
  { outlet: 'LA RAZÓN', domain: 'larazon.bo', pattern: 'larazon.bo/nacional/*' },
  { outlet: 'CORREO DEL SUR', domain: 'correodelsur.com', pattern: 'correodelsur.com/economia/*' },
  { outlet: 'UNITEL', domain: 'unitel.bo', pattern: 'unitel.bo/noticias/economia/*' },
  { outlet: 'UNITEL', domain: 'unitel.bo', pattern: 'unitel.bo/noticias/politica/*' },
  { outlet: 'RED UNO', domain: 'reduno.com.bo', pattern: 'reduno.com.bo/economia/*' },
  { outlet: 'RED UNO', domain: 'reduno.com.bo', pattern: 'reduno.com.bo/nacional/*' },
  {
    outlet: 'BRÚJULA DIGITAL',
    domain: 'brujuladigital.net',
    pattern: 'brujuladigital.net/economia/*',
  },
  {
    outlet: 'BRÚJULA DIGITAL',
    domain: 'brujuladigital.net',
    pattern: 'brujuladigital.net/nacional/*',
  },
  {
    outlet: 'BOLIVIA VERIFICA',
    domain: 'boliviaverifica.bo',
    pattern: 'boliviaverifica.bo/category/*',
  },
  { outlet: 'EL DIARIO', domain: 'eldiario.net', pattern: 'eldiario.net/portal/*economia*' },
  { outlet: 'ANF', domain: 'noticiasfides.com', pattern: 'noticiasfides.com/economia/*' },
];
