# Requisitos no funcionales y presupuestos de diseño

## 1. Regla de uso

Los valores marcados como **presupuesto técnico** son límites defensivos del código actual. No representan un SLO contractual. Los valores marcados como **pendiente** requieren aprobación institucional.

## 2. Correctitud e integridad

| Requisito | Criterio verificable | Estado |
|---|---|---|
| Revisiones inmutables | Una nueva cifra crea una revisión; no actualiza la revisión publicada anterior. | Diseño activo |
| Revisión corriente única | Índice parcial impide más de una revisión corriente por observación. | Diseño activo |
| Identidad de serie estable | La clave normalizada y su hash identifican dimensiones equivalentes. | Diseño activo |
| Valores exclusivos | Dimensiones, medidas y atributos aceptan exactamente una representación de valor. | Diseño activo |
| Escritura atómica | Observación, revisión, valores y calidad se confirman o revierten juntos. | Diseño activo |
| Idempotencia | Artefactos, lotes y revisiones usan identidades estables del dominio. | Diseño activo |

## 3. Seguridad

| Requisito | Criterio verificable | Estado |
|---|---|---|
| Default-deny | Toda ruta no marcada `@Public()` exige token. | Activo |
| Algoritmo JWT fijo | Solo RS256, con issuer y audience configurados. | Activo |
| Producción sin auth desactivada | La configuración falla si `AUTH_MODE=disabled` en producción. | Activo |
| Mínimo privilegio DB | Migrator, writer y reader usan credenciales distintas. | Activo; prueba DB pendiente |
| Secretos fuera del repositorio | `.env` ignorado y `.env.example` sin valores reales. | Activo |
| Política de confidencialidad | Restringir por rol, estado y naturaleza del dato. | Pendiente institucional |

## 4. Rendimiento y capacidad

| Presupuesto | Valor actual | Motivo |
|---|---:|---|
| Carga por lote síncrono | 500 registros | Evita transacciones HTTP no acotadas. |
| Página máxima | 200 filas | Limita memoria, serialización y payload. |
| Body HTTP | 1 MiB por defecto, máximo configurable 10 MiB | Defensa contra payloads descontrolados. |
| Statement timeout | 15 s por defecto | Evita consultas indefinidas. |
| Pool writer | 15 conexiones por instancia | Presupuesto inicial, debe calcularse con número de réplicas. |
| Pool reader | 30 conexiones por instancia | Presupuesto inicial, sujeto a carga y límites PostgreSQL. |
| Rate limit app | 300 solicitudes/minuto/IP por defecto | Protección general; endpoints sensibles requieren calibración. |
| Rate limit NGINX | 20 solicitudes/s con burst 40 | Defensa de borde inicial. |

## 5. Disponibilidad y recuperación

| Requisito | Estado |
|---|---|
| Liveness no depende de PostgreSQL | Definido en `/health`. |
| Readiness falla si reader o writer no responden | Definido en `/ready`. |
| Graceful shutdown | Nest shutdown hooks y cierre de pools. |
| Reinicio automático | Configurado en Compose para API, NGINX y PostgreSQL. |
| RPO | Pendiente de aprobación. |
| RTO | Pendiente de aprobación. |
| Restore drill | Obligatorio antes de producción; no ejecutado en fase 2. |

## 6. Observabilidad

- Logs JSON con request ID, ruta normalizada, estado y duración.
- Redacción central de headers y secretos.
- Métricas sin etiquetas de alta cardinalidad.
- `/metrics` no se publica por NGINX.
- Alertas, paneles y SLO numéricos se definen cuando exista plataforma operativa.

## 7. Gates posteriores

Fases 3 a 10 deben convertir estos requisitos en evidencia mediante migraciones reales, pruebas de privilegios, E2E, carga, backup y restauración.
