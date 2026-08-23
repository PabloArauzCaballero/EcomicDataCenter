# Verificación de recolección diaria — 2026-08-23

Qué demuestra: que las lecturas garantizadas del día atraviesan la cadena completa de
verificación contra las fuentes **en vivo** y alcanzan `PUBLISH`, sin intervención humana.

## Punto de partida

Cinco ejecuciones consecutivas del flujo `daily-economic-research` (informes
`daily-economic-report.json` de las ejecuciones 32534656445, 32555124632, 32568635877,
32585909981, 32603468494) daban `publishedCount: 0` y `pendingReviewCount: 2`, con `aiError`
presente en todas y `missingRequiredCategories: ["SOVEREIGN_BONDS"]` incluso en fin de semana.

## Procedimiento

Arnés ejecutado contra las fuentes reales, encadenando los mismos módulos que usa el colector:
`fetchPublicSource` → `assessEvidenceContentType` → `decodeSourceText` → `visibleText` →
metadatos de fuente (`htmlSourceMetadata` / `jsonSourceMetadata`) → `assessPublicationMetadata` →
`verifiedSource` / `undatedOfficialIndicator` → `locateExcerpt` → `groundClaimToExcerpt` →
`calibrateConfidenceForGrounding` → `calibrateConfidenceForSourceMetadata` →
`calibrateConfidenceForExcerptUniqueness` → `routeClaim`.

Cada lectura se verifica contra **la misma descarga** de la que se parseó, igual que hace el
colector tras esta corrección.

## Resultado

Tabla del BCB: `effectiveDate 2026-08-23`, `officialRate 11.50`, `ufv 3.33427`.

| Categoría | Fuente | Editor verificado | Fecha verificada | Cita localizada | Anclaje léxico | Confianza final | Decisión |
|---|---|---|---|---|---|---|---|
| `FX_OFFICIAL` | bcb.gob.bo | sí | sí | sí (1 ocurrencia) | SUPPORTED | VERY_HIGH | **PUBLISH** |
| `UFV` | bcb.gob.bo | sí | sí | sí (1 ocurrencia) | SUPPORTED | VERY_HIGH | **PUBLISH** |
| `FX_PARALLEL` | eldorado | sí | sí | sí (1 ocurrencia) | SUPPORTED | HIGH | **PUBLISH** |
| `FX_PARALLEL` | saldoar | sí | sí | sí (1 ocurrencia) | SUPPORTED | HIGH | **PUBLISH** |
| `FX_PARALLEL` | takenos | sí | sí | sí (1 ocurrencia) | SUPPORTED | HIGH | **PUBLISH** |

Cotizaciones paralelas observadas: ELDORADO `BOB/USDT` compra 11.68 / venta 11.51; SALDOAR
`BOB/USDT` compra 11.73 / venta 11.42; TAKENOS `BOB/USD` compra 11.92 / venta 11.47. Ninguna
afirmación citó una cifra ausente de su excerpt (`ungroundedFigures: []`) y las tres plazas
resolvieron su entidad.

## Dos defectos que este procedimiento descubrió y que quedaron corregidos

1. **Orden de las cifras.** `ungroundedNumbers` mapea cada cifra a una ocurrencia distinta de la
   evidencia **en orden**. Enunciar venta antes que compra hacía que la segunda cifra —presente en
   el excerpt— se reportara como ausente, y `persistEvidence` descartaba la lectura entera. La
   redacción deriva ahora el orden de la posición real en el payload.
2. **Carrera con la fuente.** El colector descargaba la fuente una vez para parsear y otra para la
   evidencia. Las plazas refrescan su cotización cada ~60 s, así que la cita dejaba de aparecer en
   los bytes almacenados y la lectura se perdía; ocurrió en la primera ejecución del arnés, sobre
   `saldoar`. La evidencia es ahora exactamente la descarga de la que se leyó el valor.

## Confirmación en produccion

Ejecucion 32612460117 (`main`, 2026-08-23T02:16Z), primera ejecucion exitosa del flujo desde su
puesta en marcha:

```
status: SUCCEEDED
coverage.collectedCategories: ["FX_OFFICIAL", "FX_PARALLEL", "UFV"]
coverage.missingRequiredCategories: []
submission: published=5 pending=0 duplicate=0 quarantined=0 rejected=0
items: 5 x PUBLISHED "Verifiable claim with sufficient confidence and evidence"
```

Las cinco lecturas se publicaron sin intervencion humana. La ejecucion anterior sobre la rama
(32609114939) ya habia recogido y enviado las tres lecturas del paralelo sin una sola degradacion
de metadatos, pero seguian en revision porque `routeClaim` corre en el backend y Render aun servia
el codigo anterior; el despliegue de main lo resolvio.

## Limitaciones

- La ruta de investigación con IA sigue devolviendo `429` y **no** quedó verificada. El recorte del
  prompt no basta: `groq/compound` encadena varias llamadas internas que inyectan el contenido web
  que busca, de modo que una sola investigación consume del orden de 40 000 tokens contra un límite
  de 30 000 por minuto (`Requested 18405`, `Used 21196` en la ejecución 32609114939, con el prompt
  ya reducido). Requiere subir de tier en Groq. `SOVEREIGN_BONDS`, `MACRO_DAILY` y `COMPANY_NEWS`
  dependen de ello; la cobertura diaria garantizada ya no.
- El arnés no escribe en el almacén de evidencia ni en el backend: valida hasta la decisión de
  enrutamiento, no la persistencia.
