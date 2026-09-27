import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createInflateRaw, inflateRawSync } from 'node:zlib';

/**
 * Reads the cells of a workbook without a spreadsheet library.
 *
 * Two of the institutions this observatory rates the country by publish their
 * figures only as workbooks — Freedom House and the Fraser Institute — and the
 * collector that fetches them runs from a repository that carries no
 * spreadsheet dependency. A workbook is a zip of XML, and the three parts a
 * reader needs (the sheet list, the shared strings, one sheet) are small enough
 * to open by hand. This does exactly that and nothing more: no styles, no
 * formulas, no dates. Every cell comes back as the text the file stores, which
 * is what a seed quotes as evidence anyway.
 */

/** One row of a sheet: the column letters that hold a value, and the text. */
export type SheetRow = ReadonlyMap<string, string>;

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly headerOffset: number;
}

const CENTRAL_DIRECTORY = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const LOCAL_HEADER = 0x04034b50;

function listEntries(bytes: Buffer): ZipEntry[] {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== END_OF_CENTRAL_DIRECTORY) end -= 1;
  if (end < 0) throw new Error('el cuaderno no es un archivo zip');
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(cursor) !== CENTRAL_DIRECTORY) break;
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    entries.push({
      name: bytes.toString('utf-8', cursor + 46, cursor + 46 + nameLength),
      method: bytes.readUInt16LE(cursor + 10),
      compressedSize: bytes.readUInt32LE(cursor + 20),
      headerOffset: bytes.readUInt32LE(cursor + 42),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function packedBytes(bytes: Buffer, entry: ZipEntry): Buffer {
  const at = entry.headerOffset;
  if (bytes.readUInt32LE(at) !== LOCAL_HEADER) throw new Error(`${entry.name}: cabecera rota`);
  const start = at + 30 + bytes.readUInt16LE(at + 26) + bytes.readUInt16LE(at + 28);
  return bytes.subarray(start, start + entry.compressedSize);
}

function readEntry(bytes: Buffer, entry: ZipEntry): string {
  const packed = packedBytes(bytes, entry);
  if (entry.method === 0) return packed.toString('utf-8');
  if (entry.method === 8) return inflateRawSync(packed).toString('utf-8');
  throw new Error(`${entry.name}: compresion ${entry.method} no soportada`);
}

const unescape = (text: string): string =>
  text
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, '&');

/** The text of every `<t>` inside one element, which is how rich text is stored. */
const innerText = (xml: string): string =>
  unescape(
    [...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/gu)].map((match) => match[1] ?? '').join(''),
  );

export class Workbook {
  private readonly entries: Map<string, ZipEntry>;
  private readonly strings: readonly string[];

  constructor(private readonly bytes: Buffer) {
    this.entries = new Map(listEntries(bytes).map((entry) => [entry.name, entry]));
    const shared = this.part('xl/sharedStrings.xml');
    this.strings = shared
      ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/gu)].map((match) => innerText(match[1] ?? ''))
      : [];
  }

  private part(name: string): string | null {
    const entry = this.entries.get(name);
    return entry ? readEntry(this.bytes, entry) : null;
  }

  /** The sheets in workbook order, by the name a person sees on the tab. */
  sheetNames(): string[] {
    const workbook = this.part('xl/workbook.xml') ?? '';
    return [...workbook.matchAll(/<sheet\s[^>]*?name="([^"]*)"/gu)].map((match) =>
      unescape(match[1] ?? ''),
    );
  }

  /**
   * Every row of one sheet, by the sheet's tab name.
   *
   * Located through the workbook's relationships rather than by position,
   * because `sheet2.xml` is whichever sheet the author saved second, and the
   * publisher reorders tabs between editions.
   */
  rows(sheetName: string): SheetRow[] {
    const xml = this.part(this.sheetPart(sheetName));
    if (xml === null) throw new Error(`la hoja «${sheetName}» falta en el archivo`);
    return [...xml.matchAll(/<row\s[^>]*>([\s\S]*?)<\/row>/gu)].map((row) =>
      this.cells(row[1] ?? ''),
    );
  }

  /**
   * The rows of one sheet, one at a time, without holding the sheet in memory.
   *
   * The customs registers the statistics institute publishes run to fifty
   * megabytes compressed and several hundred uncompressed — past the longest
   * string the runtime will build — so `rows` cannot open them. This inflates
   * the part as a stream and hands each row over as soon as it is complete.
   * `visit` returning `false` stops the reading, which is how a caller that
   * only wanted the header avoids inflating the rest.
   */
  async eachRow(sheetName: string, visit: (row: SheetRow) => boolean | void): Promise<void> {
    const name = this.sheetPart(sheetName);
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`la hoja «${sheetName}» falta en el archivo`);
    const packed = packedBytes(this.bytes, entry);
    const source =
      entry.method === 0
        ? Readable.from([packed])
        : Readable.from([packed]).pipe(createInflateRaw());
    const decoder = new StringDecoder('utf8');
    let pending = '';
    for await (const chunk of source) {
      pending += decoder.write(chunk as Buffer);
      let end = pending.indexOf('</row>');
      let consumed = 0;
      while (end !== -1) {
        const open = pending.lastIndexOf('<row', end);
        const body = pending.slice(pending.indexOf('>', open) + 1, end);
        if (visit(this.cells(body)) === false) {
          source.destroy();
          return;
        }
        consumed = end + '</row>'.length;
        end = pending.indexOf('</row>', consumed);
      }
      pending = pending.slice(consumed);
    }
  }

  private sheetPart(sheetName: string): string {
    const workbook = this.part('xl/workbook.xml') ?? '';
    const sheet = [...workbook.matchAll(/<sheet\s([^>]*)\/?>/gu)]
      .map((match) => match[1] ?? '')
      .find((attributes) => unescape(/name="([^"]*)"/u.exec(attributes)?.[1] ?? '') === sheetName);
    const relationId = sheet ? /r:id="([^"]*)"/u.exec(sheet)?.[1] : undefined;
    if (!relationId) throw new Error(`el cuaderno no tiene una hoja «${sheetName}»`);
    const relations = this.part('xl/_rels/workbook.xml.rels') ?? '';
    const relation = [...relations.matchAll(/<Relationship\s([^>]*)\/?>/gu)]
      .map((match) => match[1] ?? '')
      .find((attributes) => new RegExp(`Id="${relationId}"`, 'u').test(attributes));
    const target = relation ? /Target="([^"]*)"/u.exec(relation)?.[1] : undefined;
    if (!target) throw new Error(`la hoja «${sheetName}» no tiene parte en el cuaderno`);
    return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }

  private cells(rowXml: string): SheetRow {
    const out = new Map<string, string>();
    const cellPattern = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu;
    for (const match of rowXml.matchAll(cellPattern)) {
      const attributes = match[1] ?? '';
      const body = match[2] ?? '';
      const column = /r="([A-Z]+)\d+"/u.exec(attributes)?.[1];
      if (!column) continue;
      const type = /t="(\w+)"/u.exec(attributes)?.[1];
      const raw = /<v>([^<]*)<\/v>/u.exec(body)?.[1];
      let text: string | undefined;
      if (type === 's' && raw !== undefined) text = this.strings[Number(raw)];
      else if (type === 'inlineStr') text = innerText(body);
      else if (raw !== undefined) text = unescape(raw);
      if (text !== undefined && text !== '') out.set(column, text);
    }
    return out;
  }
}
