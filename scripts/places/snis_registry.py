"""Cómo se lee el registro de establecimientos del SNIS: clase, subsector, nivel y nombre.

Lo usa `build_snis_health_poi_seed.py`. Los subsectores salen del prefijo del código de
institución (`t_instit_tx.codsubsec`), confirmados contra el Excel cerrado de 2021; el
nivel, de la categoría de la clase (`clsestab2005.codcatest`).
"""

from __future__ import annotations

import re

from health_sources import folded

SAME_CONTAINED_M = 100

SUBSECTOR = {'01': 'Público', '02': 'Seguridad social', '03': 'ONG', '05': 'Privado',
             '06': 'Fuerzas Armadas', '07': 'Iglesia', '08': 'Policía'}
LEVEL = {'A': 'Tercer nivel', 'B': 'Segundo nivel', 'C': 'Primer nivel', 'D': 'Cuarto nivel'}
FAMILY_BY_CLASS = {
    'PUESTO DE SALUD': 'PUESTO_DE_SALUD',
    'CENTRO SALUD': 'CENTRO_SALUD',
    'C.S. AMBULATORIO': 'CENTRO_SALUD',
    'C.S. CON INTERNACION': 'CENTRO_SALUD',
    'C.S. INTEGRAL': 'CENTRO_SALUD',
    'CONSULTORIO VECINAL': 'CENTRO_SALUD',
    'VACUNATORIO': 'CENTRO_SALUD',
    'C. CARACTERISTICAS PART.': 'CENTRO_SALUD',
    'HOSPITAL SEGUNDO NIVEL': 'HOSPITAL',
    'HOSPITAL GENERAL': 'HOSPITAL',
    'HOSPITAL CUARTO NIVEL': 'HOSPITAL',
    'INSTITUTO ESPECIALIZADO': 'HOSPITAL',
    'POLICONSULTORIO': 'POLICONSULTORIO',
    'POLICLINICO': 'POLICONSULTORIO',
    'CLINICA': 'CLINICA',
    'BANCO DE SANGRE': 'BANCO_SANGRE',
    'MEDICINA NUCLEAR': 'DIAGNOSTICO_IMAGEN',
    'GABINETE': 'DIAGNOSTICO_IMAGEN',
}
NOT_PUBLIC_CARE = {'IDIF', 'IDE', 'CCESD', 'CENTRO DE AISLAMIENTO'}
HEALTH_GROUPS = {'SALUD', 'HEALTH_CARE'}
PREFIXES = re.compile(
    r'^(PUESTO DE SALUD|PUESTO SALUD|P S|PS|CENTRO DE SALUD INTEGRAL|CENTRO DE SALUD|CENTRO SALUD|C S I|C S A|'
    r'C S|CS|CSI|HOSPITAL|HOSP|POLICONSULTORIO|POLICLINICO|CLINICA|AMBULATORIO|CON INTERNACION|INTEGRAL)\b ?')
PERSON = re.compile(r'^(DR|DRA|LIC|DOC|DOCTOR|DOCTORA)\b')
CARE_WORD = re.compile(r'\b(CLINICA|CENTRO|CONSULTORIO|POLICONSULTORIO|HOSPITAL|INSTITUTO|UNIDAD|MEDIC|SALUD)')
STOP = {'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'SAN', 'SANTA', 'VILLA'}




def core(name: str | None) -> str:
    """El nombre sin el tipo delante: «P.S. ARABATE», «PUESTO DE SALUD ARABATE» y «ARABATE» son uno."""
    text = folded(name)
    for _ in range(3):
        text = PREFIXES.sub('', text).strip()
    return text


def tokens(name: str | None) -> set[str]:
    return {t for t in core(name).split() if t not in STOP and len(t) > 1}


ACRONYM = re.compile(r'^\(?(?:(?:[a-zñ]{1,3}\.){2,}[a-zñ]{0,3}|[a-zñ]{1,3}\.[a-zñ]{1,3}|ii|iii|iv|vi|vii|viii|ix|xi|xii)\)?[.,]?$')


def title(text: str) -> str:
    """«C.N.S. C.I.S. SAN LUCAS» → «C.N.S. C.I.S. San Lucas»: las siglas con punto y los romanos quedan en mayúscula."""
    words = re.sub(r'\s+', ' ', text).strip().lower().split(' ')
    small = {'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en'}
    out = [w.upper() if ACRONYM.match(w) else w if (i and w in small)
           else re.sub(r'(^|[(\-/])([a-zñáéíóú])', lambda m: m.group(1) + m.group(2).upper(), w)
           for i, w in enumerate(words)]
    return ' '.join(out).replace('C.s.', 'C.S.').replace('P.s.', 'P.S.')


def same_place(one: str, other: str, distance: float, approximate: bool) -> bool:
    """El mismo establecimiento: el mismo nombre cerca, o un nombre que contiene al otro muy cerca.

    «El Palmar» y «Centro de Salud Palmar Chico» a 294 m no son el mismo; «Mallasa» y
    «Centro de Salud Mallasa» a 14 m sí. Con la posición aproximada solo vale el nombre igual.
    """
    a, b = tokens(one), tokens(other)
    if not a or not b:
        return False
    if a == b:
        return True
    return not approximate and (a <= b or b <= a) and distance <= SAME_CONTAINED_M
