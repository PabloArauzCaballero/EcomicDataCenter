import { codeOf, companyIdentity } from './business-common';
import { aliasTable, HOLDER_KINDS } from './ownership-aliases';

/**
 * Quién es el titular de una fila del cuadro de accionistas.
 *
 * Dos preguntas y las dos tienen trampa. **Si es una persona o una sociedad**:
 * el cuadro no lo dice, lo dice el nombre —«S.A.», «Ltda.», «Fund», «Fondo de
 * Inversión»— y una regla de palabras acierta casi siempre; lo que no acierta
 * se declara en `HOLDER_KINDS`. **Si dos filas son la misma persona**: la ficha
 * de la Bolsa escribe «Elvio Perrogon Toledo» y el prospecto «Elvio Luis
 * Perrogón Toledo»; las variantes vistas se declaran en `ownership-aliases`.
 */

export type HolderKind = 'persona' | 'sociedad';

const ENTITY_WORDS = new RegExp(
  [
    String.raw`\bS\.?\s?A\.?(?:\s?[A-Z]\.?)?$`,
    String.raw`\bS\.?\s?A\.?\s`,
    String.raw`\bS\.?\s?R\.?\s?L\.?`,
    String.raw`\bLTDA\b`,
    String.raw`\bL\.?\s?L\.?\s?C\b`,
    String.raw`\bINC\b`,
    String.raw`\bLTD\b`,
    String.raw`\bLIMITED\b`,
    String.raw`\bN\.?\s?V\.?$`,
    String.raw`\bB\.?\s?V\.?$`,
    String.raw`\bAG$`,
    String.raw`\bK/S$`,
    String.raw`\bL\.?P\.?$`,
    String.raw`\bS\.?\s?L\.?$`,
    String.raw`\bS\.?\s?A\.?\s?C\.?$`,
    String.raw`\bS\.?\s?A\.?\s?A\.?$`,
    String.raw`\bHOLDINGS?\b`,
    String.raw`\bFUND\b`,
    String.raw`\bFONDO\b`,
    String.raw`\bFIDEICOMISO\b`,
    String.raw`\bSICAV\b`,
    String.raw`\bINVESTMENTS?\b`,
    String.raw`\bINVERSION(?:ES)?\b`,
    String.raw`\bINVERSORA\b`,
    String.raw`\bCORPORACI[OÓ]N\b`,
    String.raw`\bCOMPA[NÑ][IÍ]A\b`,
    String.raw`\bSOCIEDAD\b`,
    String.raw`\bEMPRESA\b`,
    String.raw`\bGRUPO\b`,
    String.raw`\bBANCO\b`,
    String.raw`\bGOBIERNO\b`,
    String.raw`\bTESORO\b`,
    String.raw`\bESTADO\b`,
    String.raw`\bMINISTERIO\b`,
    String.raw`\bUNIVERSIDAD\b`,
    String.raw`\bC[AÁ]MARA\b`,
    String.raw`\bCOOPERATIVA\b`,
    String.raw`\bFUNDACI[OÓ]N\b`,
    String.raw`\bASOCIACI[OÓ]N\b`,
    String.raw`\bCENTRO\b`,
    String.raw`\bINTERNATIONAL\b`,
    String.raw`\bPARTNERS\b`,
    String.raw`\bCAPITAL\b`,
    String.raw`\bACCION\b`,
    String.raw`\bSEGUROS\b`,
    String.raw`\bINDUSTRIA[LS]?\b`,
  ].join('|'),
  'iu',
);

/** Filas que no son un titular: el resto del capital agregado. */
const NOT_A_HOLDER = /^(?:otros?|otros accionistas|resto|varios|accionistas minoritarios)\b/iu;

export const isHolder = (holder: string): boolean => !NOT_A_HOLDER.test(holder.trim());

/** El nombre del titular sin comillas de maqueta ni espacios de más. */
const tidy = (holder: string): string =>
  holder
    .replace(/^\s*\d{1,2}\.?\s+(?=\D)/u, '')
    .replace(/^(?:Sra?\.|Sr\.)\s*/u, '')
    .replace(/[“”"«»]/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s+([,.])/gu, '$1')
    .trim();

const variantKey = (published: string): string => codeOf(tidy(published), 80);
const ALIASES = aliasTable(variantKey);
const KINDS = new Map(Object.entries(HOLDER_KINDS).map(([name, kind]) => [variantKey(name), kind]));

/** El nombre con el que el titular entra al corpus, ya unidas sus variantes. */
export function holderName(published: string): string {
  return ALIASES.get(variantKey(published)) ?? tidy(published);
}

export function holderKind(name: string): HolderKind {
  return KINDS.get(variantKey(name)) ?? (ENTITY_WORDS.test(name) ? 'sociedad' : 'persona');
}

/**
 * El código del titular. Una sociedad lleva el mismo código que tendría como
 * empresa —el de `companyIdentity`—, porque la cadena se arma en el tablero
 * uniendo al titular de un eslabón con la empresa del siguiente: «Inversiones
 * Zubat» dueña del Mercantil y la Zubat cuyo cuadro nombra a sus socios tienen
 * que ser el mismo código. Una persona lleva su nombre entero.
 */
export function holderCode(name: string): string {
  return holderKind(name) === 'sociedad' ? companyIdentity(name).slug.slice(0, 60) : codeOf(name, 60);
}
