/**
 * Dónde está el patrimonio de cada empresa no bancaria en sus prospectos.
 *
 * Un renglón por cuadro: emisor | corte del prospecto | página (1-based) | mes
 * en que cierra el ejercicio de la empresa | unidad con que el cuadro imprime
 * la cifra (miles, millones o bolivianos). El prospecto se busca en
 * `OWNERSHIP_DOCUMENTS` por emisor y corte.
 *
 * Sólo entran cuadros de balance auditado o de la síntesis financiera del
 * emisor en que la fila «Patrimonio» trae fechas de cierre en la cabecera. Quedan
 * fuera, anotados, los que se leyeron mal o no se pueden confirmar:
 *
 * - **Una sola emisión** (CAMSA, DISMATEC, DATEC, ELFEC, Electropaz, Paititi,
 *   Farmacias Chávez, Las Lomas, La Papelera, PIL, Prolega, TSM, Merinco): sin un
 *   segundo documento no hay cómo confirmar la cifra.
 * - **Sin fechas en la cabecera** (Equipetrol 2023, IASA 2015, G&E 2019 y 2020,
 *   Prolega 2014/2018/2020/2024, Toyosa 2014): la fila existe pero el lector no
 *   puede asignar cada cifra a su cierre.
 * - **Columnas corridas** (SOBOCE 2019 p.118, COBEE 2020 p.131): la cifra cae
 *   bajo la fecha de otra columna.
 * - **Otra medida** (COBEE 2009 p.41: 962 millones contra 2.391 del mismo cierre
 *   en la emisión de 2012; CAMSA p.107).
 *
 * - **El mismo cierre sale distinto en cada emisión** (Gravetal, IOL, Nutrioil,
 *   Toyosa; SOBOCE y Equipetrol en parte): los prospectos reexpresan el balance por
 *   la UFV y ninguna cifra coincide con la de otro documento dentro del 1 %.
 *   Para esos años no hay confirmación y no entran.
 *
 * Los resúmenes de las páginas 20-23 de cada prospecto copian el cuadro del
 * balance y no se listan: una copia no confirma nada.
 */
export const BALANCE_TABLES = `
BPC|2012-01-31|59|12|miles
BPC|2016-06-30|91|12|millones
BPC|2016-06-30|135|12|miles
BPC|2020-02-29|93|12|miles
DIN|2015-09-30|118|3|miles
DIN|2016-09-30|118|3|miles
EPE|2015-04-30|167|12|miles
EPE|2026-02-28|218|12|miles
FIN|2013-09-30|62|6|millones
FIN|2019-09-30|100|6|millones
GRB|2011-03-31|15|6|miles
GRB|2011-03-31|85|6|miles
GRB|2011-03-31|220|6|miles
GRB|2011-03-31|245|6|bolivianos
GRB|2024-02-29|78|6|bolivianos
GRB|2024-02-29|188|6|miles
IOL|2011-05-31|51|3|miles
IOL|2012-12-31|58|3|miles
IOL|2017-02-28|157|3|miles
IOL|2024-06-30|167|3|miles
NUT|2013-03-31|56|6|miles
NUT|2020-06-30|126|6|miles
NUT|2020-06-30|135|6|bolivianos
NXS|2021-08-16|90|12|bolivianos
NXS|2021-08-16|124|12|miles
NXS|2024-06-30|309|12|miles
SBC|2013-09-30|73|3|miles
SBC|2013-09-30|110|3|miles
SBC|2018-08-31|111|3|miles
SBC|2020-09-30|93|3|miles
TAE|2021-12-31|158|12|miles
TAE|2024-12-31|172|12|miles
TAE|2026-03-31|191|12|miles
TYS|2012-06-30|68|12|miles
TYS|2012-06-30|108|12|miles
TYS|2013-12-31|91|12|miles
TYS|2016-03-31|92|12|millones
TYS|2017-07-31|20|12|millones
TYS|2023-09-30|180|12|miles
`;

/** El sector con que cada emisor entra a la estimación (el que mapea a una industria de Damodaran). */
export const SECTOR_OF: Readonly<Record<string, string>> = {
  BPC: 'Energía eléctrica',
  DIN: 'Farmacéutica',
  EPE: 'Petróleo y servicios',
  FIN: 'Agroindustria',
  GRB: 'Agroindustria',
  IOL: 'Agroindustria',
  NUT: 'Agroindustria',
  NXS: 'Comercio',
  SBC: 'Cemento',
  TAE: 'Comercio',
  TYS: 'Automotriz',
};
