# Auditoría de memoria y eficiencia de recursos

## Resultado del análisis estático

No se identificó una fuga de memoria determinista en el núcleo activo. No existen caches de crecimiento ilimitado, listeners registrados por request ni intervalos persistentes. El cliente JWKS tiene cache y tasa acotadas; los reintentos serializables tienen número y demora máximos.

Sí se identificó un riesgo de fuga durante arranque parcial: si el writer se autenticaba y el reader fallaba antes de que Nest completara la creación de la aplicación, el pool writer podía conservar sockets y evitar que el proceso terminara. Los dos pools ahora se inicializan como un grupo atómico y ambos se cierran ante cualquier error de construcción o autenticación.

La ausencia de una fuga confirmada en ejecución normal no equivale a una prueba de estabilidad prolongada. El release gate exige carga sostenida con observación de RSS, heap usado, event-loop lag, conexiones activas y latencia.

## Controles aplicados

- Límite de body HTTP validado por entorno.
- Timeouts de conexión, request y keep-alive en Fastify.
- Timeouts de conexión, adquisición, statement e inactividad transaccional en PostgreSQL.
- Pools reader/writer separados y acotados.
- Inicialización atómica de ambos pools y cleanup ante arranque parcial fallido.
- Cierre de ambos pools mediante `OnApplicationShutdown`.
- Lotes de ingestión limitados a 500 registros y procesados secuencialmente dentro de una transacción.
- Consultas paginadas con `pageSize <= 200` y límite operacional para offset profundo.
- Contenedores del API y migrador con init, filesystem de solo lectura, capacidades eliminadas y periodo de apagado.

## Riesgos residuales

1. El lote de 500 registros mantiene una transacción larga y muchos savepoints. Debe medirse con datos representativos antes de aumentar ese límite.
2. La paginación por offset degrada en páginas profundas. El límite reduce abuso, pero una futura fase de producto puede introducir cursor estable si los consumidores lo requieren.
3. No existe evidencia de soak test de varias horas en la rama; queda como gate previo a producción.
4. Los límites de CPU y memoria dependen de la plataforma de despliegue y deben configurarse en Coolify, Kubernetes, ECS o el supervisor elegido, no inventarse en Compose.

## Prueba de estabilidad requerida

- Duración mínima inicial: 60 minutos.
- Perfil: lectura concurrente, ingestión individual y lotes representativos.
- Criterio: pendiente de RSS y heap estabilizada después del calentamiento; cero crecimiento monotónico no explicado; conexiones devueltas al pool; tasa de error dentro del SLO aprobado.
- Artefacto: JSON con versión, commit, carga, percentiles, muestras de memoria y conclusión.
