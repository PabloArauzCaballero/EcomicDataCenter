---
name: security-audit
description: Auditoría de seguridad del backend y de la capa de ingesta de agentes de IA (authN/Z, BOLA/BFLA, validación, inyección, secretos, JWT, SSRF, prompt injection, rate limiting, dependencias, seguridad de base de datos). Úsala para revisar seguridad con evidencia; no modifica producción.
---

# Skill: security-audit

## Propósito

Encontrar y cerrar riesgos de seguridad con evidencia reproducible, incluyendo los específicos de
entrada no confiable generada por IA.

## Cuándo usarla

Antes de release, al tocar auth/ingesta/consulta, o ante un advisory de dependencias.

## Cuándo NO usarla

Para performance o estilo. Para modificar producción (nunca).

## Fuentes obligatorias

`.claude/rules/30-security.md`, `docs/architecture/threat-model.md`,
`docs/architecture/authorization-matrix.md`, `scripts/validate_security_contracts.py`, el código de
`src/common/auth`, `src/modules/intelligence`, `src/common/errors`.

## Entradas requeridas

Alcance (endpoints/módulos) y si hay base de datos para pruebas de privilegios.

## Detente si

La verificación exige credenciales reales, acceso a Neon/producción o autenticar un MCP: propón y
detente.

## Flujo por fases

1. AuthN/AuthZ y default-deny; separación de deberes agente/humano; aislamiento por organización.
2. BOLA/BFLA en rutas (apoya con `42crunch` si está instalado). 3. Validación/sanitización (Zod
   `strict`, límites, allowlist). 4. Inyección SQL (parametrización). 5. Entrada de IA: SSRF en
   localizadores, prompt injection→cuarentena, límites de tamaño. 6. Secretos (código/git/logs;
   redacción Pino). 7. Errores sin fuga (`toSafeErrorLog`). 8. Rate limiting por identidad y CORS.
3. Auditoría append-only (privilegio+trigger). 10. Dependencias (`security:audit`). 11. Seguridad de
   base de datos (roles, reader no escribe, writer no borra auditoría).

## Comandos permitidos

`yarn quality:security`, `yarn security:audit`, `yarn test:integration` (garantías de base),
`yarn db:verify:privileges` contra base **desechable**.

## Comandos prohibidos

Uso de secretos reales, acceso a Neon/producción, OAuth de MCP sin aprobación.

## Evidencia requerida

Cada hallazgo con vector concreto (entrada→efecto), archivo, severidad y corrección; verificación en
base real cuando aplique.

## Entregables

Matriz de riesgos (con probabilidad/impacto), correcciones y evidencia, y lista de acciones que
requieren humano.

## Formato de respuesta

Resumen · matriz de riesgos · correcciones/evidencia · bloqueos que requieren autorización.

## Lista de verificación final

- [ ] `security:audit` sin high/critical. - [ ] `quality:security` verde. - [ ] Garantías de base
      probadas (append-only, inmutabilidad, sin evidencia→no publica). - [ ] Sin secretos en git/logs.

## Limitaciones

No sustituye una auditoría externa ni un pentest. SAST local (Semgrep/Aikido) es complementario.

## Trazabilidad

`prompt/programacionBackend.md` §20–§31; `docs/architecture/threat-model.md`; gate `security`;
`security:audit`; `db:verify:privileges`.
