# ADR-0002: identidad externa y JWT mediante JWKS

- Estado: aceptado con contrato pendiente
- Fecha: 2026-07-15
- Responsables: arquitectura y seguridad

## Contexto

Los diagramas definen actores funcionales, pero no entidades de usuario, sesiones, contraseñas, MFA ni ciclo de vida de identidad. Crear esas tablas duplicaría una responsabilidad externa.

## Drivers

- no inventar un subsistema de identidad;
- desacoplar el core estadístico;
- validación de firma y rotación de claves;
- autorización funcional por roles del caso de uso.

## Opciones

1. Usuarios locales: descartado por falta de modelo y duplicación.
2. Introspección remota por request: mayor dependencia de red y latencia.
3. JWT RS256 validado con JWKS: firma local con rotación de claves.

## Decisión

Validar JWT RS256 con `issuer`, `audience`, expiración y JWKS. Aplicar guard global default-deny. Los roles reconocidos son `DATA_OFFICER`, `ANALYST` y `METHODOLOGY_STEWARD`.

`DATA_OFFICER` debe incluir claim de organización. Producción rechaza `AUTH_MODE=disabled`.

## Consecuencias

Revocación, MFA y sesiones pertenecen al proveedor. El contrato exacto de claims debe ratificarse antes de producción. La indisponibilidad de JWKS puede afectar tokens con claves no cacheadas.

## Validación

Pruebas 401 para firma, issuer, audience, expiración y algoritmo; pruebas 403 por rol y organización.
