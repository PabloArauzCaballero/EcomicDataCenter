# Runbook — Tejido empresarial, principales empresas y empresarios

Alimenta tres páginas de «Empresas» en el tablero: **Tejido empresarial**, **Principales empresas** y
**Empresarios**. Migración 0097 (rubros `TEJIDO_EMPRESARIAL`, `RANKING_EMPRESARIAL`, `FORTUNAS`),
ADR 0028 (dueños y fortunas). Todo entra por el sembrador de registros anuales: una serie por cifra,
con la celda de la fuente como extracto y el comprobador de anclaje encendido.

## Colectores

| Comando | Fuente | Semilla | Cuándo |
|---|---|---|---|
| `yarn business:registry` | SIIP-MDP (SEPREC) 2008–2024 + reporte del SEPREC (corte 2025) | `business-registry.json` | cuando el SEPREC publica un reporte; también `batch: registro` en `daily-source-batches` |
| `yarn business:size` | data-bolivia.produccion.gob.bo (foto de tamaño, julio 2025) | `business-size.json` | cuando el Ministerio publique otro corte |
| `yarn business:flows` | FUNDEMPRESA (memorias y reportes, Wayback) + SEPREC | `business-registry-flows.json` | anual |
| `yarn business:tax` | Memorias del SIN | `tax-roll.json`, `tax-top-payers.json` | anual (la memoria sale a fin de año) |
| `yarn business:largest` | «Las 500» de Hugo Siles Espada | ninguna hoy | anual: la única edición gratuita (2024) trae las tablas como imagen; el colector vuelve a mirar y se detiene si algún día tienen texto |
| `yarn business:wealth` | Forbes, UBS, Damodaran | `wealth-benchmarks.json` | anual |
| `yarn business:owners` | Memorias de bancos, prospectos BBV, ASFI: accionistas y patrimonio del balance | `company-ownership.json` | anual |

Todos guardan una copia de cada documento en el temporal de la máquina para no castigar al servidor
mientras se ajusta un parser; **la recolección de verdad se corre con `--fresh`**. En una laptop con
poca memoria: `node --max-old-space-size=700 node_modules/tsx/dist/cli.mjs scripts/business/<archivo>.ts`.

## Reglas que no hay que volver a derivar

- **Los PDF se leen por coordenadas** (`scripts/business/pdf-rows.ts`), nunca con texto corrido: en la
  memoria 2025 del SIN el texto corrido corre la columna del departamento una fila, y en el reporte
  del SEPREC desordena las cifras de los gráficos.
- **SIIP 2025 no se usa.** Publica 470.077 empresas para 2025 y el propio SEPREC 398.131 a noviembre:
  el punto de 2025 sale del reporte del SEPREC. La columna 2026 del SIIP es un corte a febrero y se
  descarta.
- **2013 es un quiebre**: +41 % por la depuración del registro, no por empresas nuevas. El tablero lo
  marca.
- **Errata del SEPREC (nov-2025)**: Oruro y Potosí con la misma cifra (18.603) en el gráfico por
  departamento. El colector contrasta cada departamento con adultos + jóvenes del gráfico etario y
  deja fuera el que no cuadra (Potosí); el tablero puede sumarlo al dibujar.
- **El reporte del SEPREC trae la fuente con mojibake** («AnÛnima», «AcƟvidades»): `repairAccents`
  en `registry-sources.ts`.
- **Tamaño no es facturación.** Ninguna fuente pública cuenta empresas por tramo de ventas. El tablero
  muestra el tamaño declarado al registro (un corte) y la categoría del padrón de Impuestos (anual),
  cada uno con su nombre.
- **Las fortunas estimadas no se siembran** (ADR 0028): se siembran participaciones y patrimonios y el
  tablero multiplica.
- Para actualizar el corte del SEPREC: cambiar `SEPREC_STOCK_REPORT` en `registry-sources.ts` por el
  PDF nuevo de `https://www.seprec.gob.bo/index.php/datos/` (el que no dice NUEVAS ni RENOV) y su total.

## Despliegue

Las semillas nuevas van a `dev` y a `test`. `seeds-to-test` retiene una semilla cuyo runner o esquema
difieran entre ramas, así que primero llega el código (esquema, cargador, migración) a las dos ramas
y después las semillas. Verificar en cada tablero `/api/tejido-empresarial`,
`/api/principales-empresas` y `/api/empresarios` con cifras, no sólo con 200.
