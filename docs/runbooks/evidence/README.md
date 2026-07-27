# Evidencia operativa versionada

Este directorio conserva los artefactos que sustentan decisiones institucionales
y que, por tanto, no pueden vivir en `artifacts/`, que está fuera de control de
versiones por política.

| Artefacto | Qué demuestra |
|---|---|
| `restore-drill-*.md` | Que un respaldo fue restaurado de extremo a extremo, con RTO y RPO medidos |
| `soak-test-*.md` | Que el proceso se mantiene estable bajo carga sostenida |

Cada informe se acompaña de su `.sha256`. Los volcados de base de datos y los
reportes de carga **no** se versionan: pueden contener datos y crecen sin
límite; permanecen en `artifacts/`, que CI publica como diagnóstico transitorio.

Un respaldo cuya restauración no se ha probado no cuenta como respaldo, y una
prueba sin artefacto conservado no cuenta como prueba.
