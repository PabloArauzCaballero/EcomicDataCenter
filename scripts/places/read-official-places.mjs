/**
 * What the three official-source readers of 2026-09-23 have in common.
 *
 * The Ministry of Education register of schools, the hydrocarbons agency list
 * of licensed service stations and a private map of cash machines arrive in
 * three different shapes, and are held to the same rules the SEPREC and AGEMED
 * readers already apply: a coordinate that contradicts its own row does not
 * enter, a private person's dwelling is never published, and no contact detail
 * travels from a source that grants no open licence.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Una direccion que nombra la vivienda de alguien.
 *
 * No se descarta el lugar —una escuela sigue siendo una escuela—, se retira la
 * linea: «al lado de la vivienda de don Filemon Herrera» pone en un mapa
 * publico donde vive una persona con nombre y apellido.
 */
const DWELLING = /particular|vivienda|domicilio/iu;

export function metresBetween(oneLat, oneLon, otherLat, otherLon) {
  const north = (otherLat - oneLat) * 111320;
  const east = (otherLon - oneLon) * 111320 * Math.cos((oneLat * Math.PI) / 180);
  return Math.hypot(north, east);
}

/** La mediana, que un punto a 500 km no arrastra como si fuera la media. */
export function median(values) {
  const sorted = [...values].sort((one, other) => one - other);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Dentro del rectangulo de Bolivia, el mismo que usan los otros lectores. */
export function insideBolivia(latitude, longitude) {
  return latitude >= -23 && latitude <= -9 && longitude >= -70 && longitude <= -57;
}

/** Un texto que el publicador escribio, o null si lo dejo en blanco. */
export function stated(value, longest) {
  const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
  if (text.length === 0) return null;
  return text.slice(0, longest);
}

/** La direccion, o null y un aviso si nombra una vivienda. */
export function withoutDwelling(address) {
  if (address && DWELLING.test(address)) {
    return { address: null, warning: 'direccion_retirada_nombra_una_vivienda' };
  }
  return { address, warning: null };
}

/** Doce decimales son nanometros: nadie declara eso, lo calculo una maquina. */
export function computedPrecision(latitude, longitude) {
  const decimals = Math.max(
    String(latitude).split('.').at(-1)?.length ?? 0,
    String(longitude).split('.').at(-1)?.length ?? 0,
  );
  return decimals >= 12;
}

/** Un identificador para una fila que su publicador no numera. */
export function contentFingerprint(...parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

/** El centro de cada grupo, sacado de los propios registros que lo nombran. */
export function centresBy(records, keyOf) {
  const grouped = new Map();
  for (const record of records) {
    const key = keyOf(record);
    const cell = grouped.get(key);
    if (cell) cell.push(record);
    else grouped.set(key, [record]);
  }
  const centres = new Map();
  for (const [key, rows] of grouped) {
    centres.set(key, {
      latitude: median(rows.map((row) => row.latitud)),
      longitude: median(rows.map((row) => row.longitud)),
    });
  }
  return centres;
}

/**
 * Las unidades educativas ya construidas, como referencia de departamento.
 *
 * Son diecisiete mil puntos repartidos por todo el pais, cada uno con el
 * departamento que el ministerio declara. No es un poligono, pero es la unica
 * referencia territorial oficial que hay en el repositorio.
 */
export async function readSchoolReferences(directory) {
  const references = [];
  for (const name of (await readdir(directory)).filter((file) => file.endsWith('.json'))) {
    const seed = JSON.parse(await readFile(join(directory, name), 'utf8'));
    for (const place of seed.places ?? []) {
      if (place.department) {
        references.push({
          latitude: place.latitude,
          longitude: place.longitude,
          department: place.department,
        });
      }
    }
  }
  if (references.length === 0) throw new Error(`no hay escuelas de referencia en ${directory}`);
  return references;
}

/**
 * El departamento que dicen las escuelas mas cercanas a un punto.
 *
 * Vota la mayoria de las cinco mas cercanas dentro de 60 km. Sin ninguna tan
 * cerca devuelve null: un punto en medio del Chaco no se descarta por falta de
 * vecinos, se queda sin cotejo y el aviso lo dice.
 */
export function departmentVoter(references, neighbours = 5, limitKm = 60) {
  const grid = new Map();
  for (const reference of references) {
    const key = `${Math.floor(reference.latitude * 5)}:${Math.floor(reference.longitude * 5)}`;
    const cell = grid.get(key);
    if (cell) cell.push(reference);
    else grid.set(key, [reference]);
  }
  return (latitude, longitude) => {
    const cellLat = Math.floor(latitude * 5);
    const cellLon = Math.floor(longitude * 5);
    const near = [];
    for (let down = -3; down <= 3; down += 1) {
      for (let across = -3; across <= 3; across += 1) {
        for (const reference of grid.get(`${cellLat + down}:${cellLon + across}`) ?? []) {
          const km =
            metresBetween(latitude, longitude, reference.latitude, reference.longitude) / 1000;
          if (km <= limitKm) near.push({ km, department: reference.department });
        }
      }
    }
    if (near.length === 0) return null;
    near.sort((one, other) => one.km - other.km);
    const votes = new Map();
    for (const { department } of near.slice(0, neighbours)) {
      votes.set(department, (votes.get(department) ?? 0) + 1);
    }
    return [...votes].sort((one, other) => other[1] - one[1])[0][0];
  };
}
