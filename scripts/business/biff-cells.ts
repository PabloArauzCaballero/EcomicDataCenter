/**
 * Las celdas de un cuaderno `.xls` de los de antes, sin biblioteca de hojas.
 *
 * Damodaran publica sus múltiplos por industria en el formato binario de Excel
 * 97 (BIFF8 dentro de un archivo compuesto OLE), no en el `.xlsx` que lee
 * `xlsx-cells`: veinte años de archivos con la misma extensión y el mismo
 * formato. El repositorio no carga una dependencia de hojas de cálculo y no la
 * necesita para esto: un archivo compuesto es una tabla de sectores encadenados
 * y el libro es una lista de registros de largo fijo. Aquí se leen los que
 * guardan valores —cadenas compartidas, números, RK, fórmulas con su resultado
 * en caché— y nada más: ni estilos ni fechas ni fórmulas sin calcular.
 */

/** Una celda: el texto o el número que el archivo guarda. */
export type BiffValue = string | number;

/** Una hoja: su nombre de pestaña y sus filas, con huecos donde no hay celda. */
export interface BiffSheet {
  readonly name: string;
  readonly rows: readonly (readonly (BiffValue | undefined)[])[];
}

const END_OF_CHAIN = 0xfffffffe;
const FREE = 0xffffffff;

/** El flujo «Workbook» del archivo compuesto, siguiendo su cadena de sectores. */
function workbookStream(bytes: Buffer): Buffer {
  if (bytes.readUInt32LE(0) !== 0xe011cfd0) throw new Error('no es un archivo compuesto OLE');
  const shift = bytes.readUInt16LE(0x1e);
  const size = 1 << shift;
  const at = (sector: number): Buffer => bytes.subarray((sector + 1) * size, (sector + 2) * size);
  const fatSectors: number[] = [];
  for (let index = 0; index < 109; index += 1) {
    const sector = bytes.readUInt32LE(0x4c + index * 4);
    if (sector !== FREE) fatSectors.push(sector);
  }
  let difat = bytes.readUInt32LE(0x44);
  while (difat !== END_OF_CHAIN && difat !== FREE) {
    const block = at(difat);
    for (let index = 0; index < size / 4 - 1; index += 1) {
      const sector = block.readUInt32LE(index * 4);
      if (sector !== FREE) fatSectors.push(sector);
    }
    difat = block.readUInt32LE(size - 4);
  }
  const fat = Buffer.concat(fatSectors.map(at));
  const chain = (start: number): Buffer => {
    const parts: Buffer[] = [];
    for (let sector = start; sector !== END_OF_CHAIN; sector = fat.readUInt32LE(sector * 4)) {
      if (parts.length > fat.length / 4) throw new Error('cadena de sectores circular');
      parts.push(at(sector));
    }
    return Buffer.concat(parts);
  };
  const directory = chain(bytes.readUInt32LE(0x30));
  const cutoff = bytes.readUInt32LE(0x38);
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory.readUInt16LE(offset + 64);
    const name = directory.toString('utf16le', offset, offset + Math.max(0, nameLength - 2));
    if (name !== 'Workbook' && name !== 'Book') continue;
    const length = directory.readUInt32LE(offset + 120);
    /*
     * Un libro de menos de cuatro kilobytes viviría en el mini flujo. Ninguna
     * hoja de Damodaran pesa tan poco, y leer el mini flujo para un caso que no
     * existe sería código que nadie prueba.
     */
    if (length < cutoff) throw new Error('el libro vive en el mini flujo: no soportado');
    return chain(directory.readUInt32LE(offset + 116)).subarray(0, length);
  }
  throw new Error('el archivo compuesto no trae un flujo Workbook');
}

interface BiffRecord {
  readonly type: number;
  readonly data: Buffer;
  readonly offset: number;
}

function recordsOf(stream: Buffer): BiffRecord[] {
  const records: BiffRecord[] = [];
  for (let offset = 0; offset + 4 <= stream.length;) {
    const type = stream.readUInt16LE(offset);
    const length = stream.readUInt16LE(offset + 2);
    records.push({ type, data: stream.subarray(offset + 4, offset + 4 + length), offset });
    offset += 4 + length;
  }
  return records;
}

/**
 * Las cadenas compartidas, que pueden cortarse entre un registro y el siguiente.
 *
 * El formato parte la tabla en registros de continuación de ocho kilobytes y,
 * si el corte cae en medio de una cadena, el trozo siguiente empieza con su
 * propio byte de opciones: la misma cadena puede seguir en un solo byte por
 * carácter después de haber empezado en dos. Por eso se lee segmento a
 * segmento y no como un bloque.
 */
function sharedStrings(segments: readonly Buffer[]): string[] {
  let part = 0;
  let cursor = 8;
  const advance = (): void => {
    if (cursor >= (segments[part]?.length ?? 0)) {
      part += 1;
      cursor = 0;
    }
  };
  const take = (count: number): Buffer => {
    advance();
    const segment = segments[part] ?? Buffer.alloc(0);
    const slice = segment.subarray(cursor, cursor + count);
    cursor += count;
    if (slice.length < count) throw new Error('tabla de cadenas truncada');
    return slice;
  };
  const skip = (count: number): void => {
    for (let left = count; left > 0;) {
      advance();
      const available = Math.min(left, (segments[part]?.length ?? 0) - cursor);
      if (available <= 0 && part >= segments.length) throw new Error('tabla de cadenas truncada');
      cursor += available;
      left -= available;
    }
  };
  const total = segments[0]?.readUInt32LE(4) ?? 0;
  const strings: string[] = [];
  for (let index = 0; index < total; index += 1) {
    const characters = take(2).readUInt16LE(0);
    const flags = take(1).readUInt8(0);
    const runs = flags & 0x08 ? take(2).readUInt16LE(0) : 0;
    const extended = flags & 0x04 ? take(4).readUInt32LE(0) : 0;
    let wide = (flags & 0x01) === 1;
    let text = '';
    while (text.length < characters) {
      const room = (segments[part]?.length ?? 0) - cursor;
      const count = Math.min(characters - text.length, Math.floor(room / (wide ? 2 : 1)));
      if (count <= 0) {
        if (part + 1 >= segments.length) throw new Error('tabla de cadenas truncada');
        part += 1;
        cursor = 0;
        wide = (take(1).readUInt8(0) & 0x01) === 1;
        continue;
      }
      const chunk = take(count * (wide ? 2 : 1));
      text += wide ? chunk.toString('utf16le') : chunk.toString('latin1');
    }
    skip(runs * 4 + extended);
    strings.push(text);
  }
  return strings;
}

/** Un número RK: entero o doble recortado, quizás multiplicado por cien. */
function rkNumber(rk: number): number {
  const cents = (rk & 0x01) === 1;
  let value: number;
  if (rk & 0x02) value = rk >> 2;
  else {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4);
    value = buffer.readDoubleLE(0);
  }
  return cents ? value / 100 : value;
}

/** Una cadena con su largo en dos bytes y su byte de opciones (LABEL, STRING). */
function unicodeString(data: Buffer, at: number): string {
  const characters = data.readUInt16LE(at);
  const wide = (data.readUInt8(at + 2) & 0x01) === 1;
  const start = at + 3;
  return wide
    ? data.toString('utf16le', start, start + characters * 2)
    : data.toString('latin1', start, start + characters);
}

/** Todas las hojas del libro, con las celdas que guardan un valor. */
export function biffSheets(bytes: Buffer): BiffSheet[] {
  const records = recordsOf(workbookStream(bytes));
  const sstAt = records.findIndex((record) => record.type === 0x00fc);
  const segments: Buffer[] = [];
  if (sstAt >= 0) {
    segments.push(records[sstAt]?.data ?? Buffer.alloc(0));
    for (let index = sstAt + 1; records[index]?.type === 0x003c; index += 1) {
      segments.push(records[index]?.data ?? Buffer.alloc(0));
    }
  }
  const strings = segments.length ? sharedStrings(segments) : [];
  const sheets = records
    .filter((record) => record.type === 0x0085)
    .map((record) => {
      const length = record.data.readUInt8(6);
      const wide = (record.data.readUInt8(7) & 0x01) === 1;
      const name = wide
        ? record.data.toString('utf16le', 8, 8 + length * 2)
        : record.data.toString('latin1', 8, 8 + length);
      return { name, start: record.data.readUInt32LE(0) };
    });
  return sheets.map(({ name, start }) => {
    const rows: (BiffValue | undefined)[][] = [];
    const put = (row: number, column: number, value: BiffValue): void => {
      const line = rows[row] ?? [];
      line[column] = value;
      rows[row] = line;
    };
    let pending: { row: number; column: number } | null = null;
    const first = records.findIndex((record) => record.offset === start);
    for (let index = first + 1; index < records.length; index += 1) {
      const { type, data } = records[index] ?? { type: 0x000a, data: Buffer.alloc(0) };
      if (type === 0x000a) break;
      const row = data.length >= 4 ? data.readUInt16LE(0) : 0;
      const column = data.length >= 4 ? data.readUInt16LE(2) : 0;
      if (type === 0x00fd) put(row, column, strings[data.readUInt32LE(6)] ?? '');
      else if (type === 0x0203) put(row, column, data.readDoubleLE(6));
      else if (type === 0x027e) put(row, column, rkNumber(data.readUInt32LE(6)));
      else if (type === 0x0204) put(row, column, unicodeString(data, 6));
      else if (type === 0x00bd) {
        const last = data.readUInt16LE(data.length - 2);
        for (let cell = column; cell <= last; cell += 1) {
          put(row, cell, rkNumber(data.readUInt32LE(4 + (cell - column) * 6 + 2)));
        }
      } else if (type === 0x0006) {
        if (data.readUInt16LE(12) !== 0xffff) put(row, column, data.readDoubleLE(6));
        else if (data.readUInt8(6) === 0) pending = { row, column };
      } else if (type === 0x0207 && pending) {
        put(pending.row, pending.column, unicodeString(data, 0));
        pending = null;
      }
    }
    return { name, rows };
  });
}
