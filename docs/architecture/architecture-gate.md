# Gate de arquitectura — Fase 2 de 10

## Resultado

**Aprobado para continuar a diseño físico**, con bloqueos de producción explícitos.

## Evidencia

- [x] Alcance y límites del sistema definidos.
- [x] Perfil de riesgo y capacidades condicionales documentados.
- [x] Dirección de dependencias y excepciones documentadas.
- [x] Contexto, contenedores, componentes, despliegue y fronteras de confianza modelados.
- [x] ADR de adapter HTTP, identidad, colas, DB, idempotencia, logging, lectura, API, transacciones, despliegue y backup.
- [x] Modelo de amenazas STRIDE con riesgos y controles verificables.
- [x] Matriz de roles y operaciones derivada de los casos de uso.
- [x] Validación estática de dependencias incluida.
- [x] Ningún cambio introduce una entidad o caso de uso no respaldado.

## Bloqueos para producción, no para fase 3

1. Ratificar claims del proveedor de identidad.
2. Ratificar política de confidencialidad.
3. Definir SLO, RPO y RTO.
4. Definir plataforma objetivo final y gestión de secretos.
5. Ejecutar las pruebas runtime en fases posteriores.
