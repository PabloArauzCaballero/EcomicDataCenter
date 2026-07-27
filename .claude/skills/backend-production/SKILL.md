---
name: backend-production
description: Coordina la implementación de una funcionalidad backend de producción en este núcleo NestJS (arquitectura, validación, persistencia, seguridad, pruebas, observabilidad, contratos y evidencia). Úsala al construir o extender un módulo/endpoint, no para auditar.
---

# Skill: backend-production

## Propósito

Implementar una capacidad backend lista para producción respetando el stack real y dejando
evidencia ejecutada.

## Cuándo usarla

Al crear o extender un módulo, endpoint, servicio de ingesta/consulta, o el modelo de datos.

## Cuándo NO usarla

Para auditar lo existente (usa `backend-hardening` o las skills de auditoría) ni para elegir una
librería (usa `library-selection`).

## Fuentes obligatorias

`prompt/programacionBackend.md`, `prompt/programacionGeneral.md`, `docs/decisions/*`,
`systemInfo/*.puml`, `docs/endpoints/openapi.yaml`, `.claude/rules/`.

## Entradas requeridas

Requisito claro y su fuente; entidades/estados afectados; contrato esperado. Si falta algo crítico
o contradice un ADR: **detente y pregunta**.

## Detente si

Falta requisito, hay contradicción con un ADR, se necesita una dependencia nueva, o el cambio toca
migraciones destructivas, Neon/producción o secretos.

## Flujo por fases

1. **Diseño**: ubica la capa correcta (controller→service→repository); confirma módulo y contrato.
2. **Contrato**: define/actualiza el esquema Zod (`strict()`, límites) y el DTO/mapper de respuesta.
3. **Datos** (si aplica): añade migración **aditiva** hacia adelante; regenera catálogo y modelos
   (`sync_model_catalog.py`, `generate_models.py`); nunca reescribas una migración aplicada.
4. **Negocio**: implementa el service con transacción/idempotencia según ADR 0005/0009; reader/writer
   separados; sin lógica en el controller.
5. **Seguridad**: rol y default-deny; entrada no confiable validada y aislada; sin secretos en logs.
6. **Observabilidad**: métrica/estructura de log con correlation ID; sin datos sensibles.
7. **Contrato publicado**: extiende `scripts/build_openapi.py`; regenera OpenAPI/Postman.
8. **Pruebas**: unitarias de la lógica; integración si toca base/concurrencia/SQL generado.
9. **Verificación**: ejecuta el checklist de evidencia.

## Comandos permitidos

`yarn typecheck`, `yarn lint`, `yarn build`, `yarn test`, `yarn test:integration`, `yarn quality:all`,
`yarn db:verify:migrations`, `yarn openapi:export`, `yarn postman:generate`. Migraciones/seed solo
contra base local pasando `DATABASE_*_URL` inline.

## Comandos prohibidos

Migraciones/DDL contra Neon/producción, `git push`, `sync({force/alter})`, instalar deps sin ADR.

## Evidencia requerida

`build/typecheck/lint = 0`, `test` y (si aplica) `test:integration` en verde, `quality:all = 0`,
sin drift de OpenAPI/rutas. Registra resultados y limitaciones.

## Entregables

Código en la capa correcta, migración+modelos si aplica, esquema Zod, contrato regenerado, pruebas,
y nota de evidencia.

## Formato de respuesta

Qué se implementó · archivos tocados · decisiones · evidencia ejecutada · pendientes/limitaciones.

## Lista de verificación final

- [ ] Sin Express/cola/Redis nuevos sin ADR. - [ ] Controller sin persistencia; sin modelo ORM en
      la respuesta. - [ ] Zod en el borde. - [ ] Migración aditiva + catálogo/modelos regenerados.
- [ ] Rol y default-deny. - [ ] Métrica/log sin datos sensibles. - [ ] OpenAPI/Postman sin drift.
- [ ] Pruebas nuevas. - [ ] `quality:all` verde.

## Limitaciones

No aprueba producción por sí sola (eso es `production-verification`). No decide dependencias.

## Trazabilidad

`prompt/programacionBackend.md` §3,§8,§9,§16,§20; ADR 0004/0005/0007/0009; gates `architecture`,
`persistence`, `use-cases`, `physical-model`, `security`, `openapi`, `routes`.
