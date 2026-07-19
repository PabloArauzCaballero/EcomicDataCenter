# Mapeo de estándares internacionales aplicables

## Alcance y advertencia

Este documento es una **matriz de referencia técnica**, no una declaración de certificación. La conformidad formal con ISO, TIA o un esquema Tier requiere alcance institucional, evaluación de riesgos, evidencias operativas, controles físicos, auditoría independiente y, cuando corresponda, un organismo acreditado.

El repositorio cubre software y operación de una plataforma de datos. No puede demostrar por sí solo redundancia eléctrica, climatización, protección contra incendios, emplazamiento, cableado, vigilancia física ni clasificación de disponibilidad de una instalación.

## Fuentes oficiales verificadas

| Referencia | Estado verificado en julio de 2026 | Aplicación al proyecto |
|---|---|---|
| [ISO/IEC 27001:2022](https://www.iso.org/standard/27001.html) y Amd 1:2024 | Publicada | Requisitos de un SGSI y gestión continua de riesgos de información. |
| [ISO/IEC 27002:2022](https://www.iso.org/standard/75652.html) | Publicada | Guía de controles de acceso, criptografía, operaciones, incidentes y activos. |
| [ISO/IEC 22237-1:2021](https://www.iso.org/standard/78550.html) | Publicada | Conceptos generales y clasificación de disponibilidad, seguridad y eficiencia energética de instalaciones de data center. |
| [ISO/IEC 22237-6:2024](https://www.iso.org/standard/82250.html) | Publicada | Seguridad física de espacios y sistemas del data center. |
| [ISO/IEC TS 22237-7:2018](https://www.iso.org/standard/73014.html) | Publicada, en revisión | Procesos de gestión y operación de data centers. |
| [ISO/IEC TS 22237-31:2026](https://www.iso.org/standard/88711.html) | Publicada, edición 2 | KPI de resiliencia de infraestructura eléctrica y ambiental; excluye software, cloud y aplicaciones. |
| [ANSI/TIA-942-C](https://tiaonline.org/standard/tia-942/) | Revisión C, mayo de 2024 | Infraestructura de telecomunicaciones, energía, enfriamiento, arquitectura, incendio, seguridad y sostenibilidad. |
| [ISO 22301:2019](https://www.iso.org/standard/75106.html) + Amd 1:2024 | Publicada; una edición 3 está en desarrollo | Sistema de gestión de continuidad del negocio. |
| [ISO/IEC 20000-1:2018](https://www.iso.org/standard/70636.html) | Publicada; confirmada en 2023 | Sistema de gestión del servicio: planificación, transición, entrega y mejora. |
| [NIST SP 800-218 v1.1](https://csrc.nist.gov/pubs/sp/800/218/final) | Final | Marco SSDF complementario para desarrollo seguro. La revisión 1/v1.2 seguía como borrador al revisar este documento. |

## Matriz de trazabilidad

| Dominio de control | Evidencia en el repositorio | Estado | Trabajo institucional o físico pendiente |
|---|---|---|---|
| Gestión de riesgos de información | `docs/architecture/threat-model.md`, límites de confianza, matriz de autorización y este registro de hallazgos | Parcial | Aprobar metodología, propietarios, apetito de riesgo y ciclo de revisión. |
| Inventario y clasificación de activos | Modelo físico, catálogo de entidades, contratos y propiedad por schemas | Parcial | Inventario institucional de servidores, redes, secretos, proveedores y datos personales. |
| Identidad y acceso | JWT RS256/JWKS, issuer, audience, roles, claims de organización y roles PostgreSQL separados | Implementado en software | Integrar IdP real, MFA administrativa, altas/bajas, recertificación y evidencia de rotación. |
| Mínimo privilegio | Migrador, writer, reader y backup separados; `public` restringido | Implementado y probado por CI | Aplicar credenciales reales mediante secret manager y revisar grants periódicamente. |
| Desarrollo seguro | TypeScript estricto, Zod, gates, pruebas, lockfile, revisión de tamaño y Clean Code | Parcial | Protección de rama, revisores obligatorios, escaneo continuo y gestión de vulnerabilidades. |
| Registro y monitoreo | Pino estructurado, request ID seguro, métricas de HTTP y base de datos | Parcial | Centralización, retención, alertas, acceso a logs y sincronización horaria del entorno. |
| Protección de información en logs | Redacción central y errores operativos sin SQL, bind values ni mensajes crudos | Implementado en código | Validación en plataforma y pruebas de fuga con datos sintéticos. |
| Seguridad de red | NGINX como edge, red interna, API no publicada directamente y `/metrics` bloqueado externamente | Implementado en Compose | TLS, firewall, WAF según riesgo, segmentación real y revisión de proxy confiable. |
| Gestión de cambios | Migraciones versionadas, verificación de upgrade/rollback y PR de hardening | Parcial | Proceso de aprobación, segregación de funciones y ventana de cambio. |
| Continuidad | Runbooks de backup, restore, despliegue, migración e incidentes | Parcial | BIA, RTO/RPO aprobados, copias fuera del dominio de falla y simulacros periódicos. |
| Gestión del servicio | Health/readiness, observabilidad, procedimientos operativos y release gate | Parcial | Catálogo de servicio, SLO/SLI aprobados, gestión de capacidad, problemas y proveedores. |
| Seguridad física | Ninguna evidencia suficiente en código | Fuera del alcance del repositorio | Evaluación del sitio, accesos físicos, CCTV, zonas, incendios y personal conforme al estándar elegido. |
| Energía y climatización | Ninguna evidencia suficiente en código | Fuera del alcance del repositorio | Topología, redundancia, mantenimiento, sensores, capacidad y eficiencia del data center. |
| Cableado y telecomunicaciones | NGINX y redes lógicas no prueban infraestructura física | Fuera del alcance del repositorio | Diseño y certificación de cableado, rutas, salas y redundancia. |
| Resiliencia de infraestructura | Health checks de software no equivalen a resiliencia de DCI | Fuera del alcance del repositorio | KPI físicos conforme ISO/IEC TS 22237-31:2026 o evaluación TIA/Tier independiente. |

## Criterios de uso

1. **ISO/IEC 27001 y 27002** son el marco principal para seguridad de la información de la plataforma.
2. **ISO 22301** gobierna continuidad; backup exitoso no demuestra continuidad sin BIA, RTO/RPO y simulacro.
3. **ISO/IEC 20000-1** guía operación y mejora del servicio, no solo el código.
4. **ISO/IEC 22237 y TIA-942-C** se usan para requisitos de alojamiento e infraestructura física. El backend solo aporta requisitos de disponibilidad, monitoreo, capacidad y recuperación que el data center debe soportar.
5. **NIST SSDF** complementa el SDLC seguro y no sustituye las normas organizacionales.
6. No se asigna nivel Tier, Rated o Availability Class desde este repositorio.

## Evidencia mínima para una revisión de producción

- Alcance del servicio y responsables aprobados.
- Diagrama de despliegue real y flujo de datos.
- Evaluación de riesgos vigente.
- Matriz de accesos y segregación de funciones.
- Inventario de secretos y política de rotación.
- Resultado de CI, SAST, dependencias e imagen.
- Soak/load test con métricas de memoria y latencia.
- Restore drill firmado y medición de RTO/RPO.
- Evidencia de TLS, firewall, monitoreo y alertas.
- Evaluación del proveedor o instalación física contra el estándar seleccionado.
