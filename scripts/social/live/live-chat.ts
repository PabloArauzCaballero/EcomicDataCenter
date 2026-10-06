/**
 * Lo que se guarda de cada línea del chat de un live, sin el nombre de quien la
 * escribió. Puro, para poder probarlo sin abrir un navegador.
 */

type Json = Record<string, unknown>;

export interface ChatItem {
  idx: string;
  author: string;
  /** La fila del autor (nombre, insignias «N.º 2», nivel): se resta del texto, nunca se guarda. */
  ownerText: string;
  body: string;
  full: string;
  chat: boolean;
}

/**
 * El texto del comentario sin el nombre de quien lo escribió. Si el cuerpo no se
 * encontró, se resta del texto completo la fila del autor; si tampoco se puede
 * separar, se descarta: nunca se guarda un texto que pueda llevar el nombre.
 */
export function messageBody(
  item: Pick<ChatItem, 'body' | 'full' | 'ownerText' | 'author'>,
): string {
  if (item.body) return item.body;
  for (const prefix of [item.ownerText, item.author]) {
    if (prefix && item.full.startsWith(prefix)) return item.full.slice(prefix.length).trim();
  }
  return '';
}

/** Tipo de evento de una línea que no es comentario. El texto se descarta salvo el regalo. */
export function eventOf(full: string, author: string): Json | null {
  const rest = author && full.startsWith(author) ? full.slice(author.length).trim() : full;
  if (!rest) return null;
  const gift = /env[ií][oó]\s+(.+?)\s*x\s*(\d+)/iu.exec(rest);
  if (gift) return { kind: 'gift', gift: gift[1]?.trim(), count: Number(gift[2]) };
  if (/se uni[oó]/iu.test(rest)) return { kind: 'join' };
  if (/compart/iu.test(rest)) return { kind: 'share' };
  if (/sigui[oó]|empezado a seguir/iu.test(rest)) return { kind: 'follow' };
  if (/gusta/iu.test(rest)) return { kind: 'like' };
  if (/bienvenida a TikTok LIVE|Se han omitido|Normas de la comunidad/iu.test(rest)) return null;
  return { kind: 'other' };
}
