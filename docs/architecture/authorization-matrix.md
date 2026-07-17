# Matriz de autorización funcional

La matriz deriva de los actores del caso de uso. No reemplaza la política pendiente de confidencialidad.

| Capacidad | DATA_OFFICER | ANALYST | METHODOLOGY_STEWARD |
|---|:---:|:---:|:---:|
| Registrar observación | Sí, para su organización | No | No |
| Importar lote | Sí, para su organización | No | No |
| Registrar artefacto fuente | Sí | No | Sí |
| Consultar organizaciones/fuentes | Sí | Sí | Sí |
| Consultar datos corrientes | No por defecto | Sí | Sí |
| Consultar vintage | No por defecto | Sí | Sí |
| Consultar trazabilidad/calidad | Limitado a incidencias operativas | Sí | Sí |
| Mantener semántica y clasificaciones | No | No | Sí |
| Mantener datasets/metodologías | No | No | Sí |
| Definir reglas de calidad | No | No | Sí |
| Resolver incidencias | Sí, operación | No | Sí, gobierno |

## Reglas contextuales

- `DATA_OFFICER` debe incluir `organization_id` y no puede cargar en nombre de otra organización.
- Un token válido sin rol reconocido no autoriza operaciones funcionales.
- 401 indica identidad inválida o ausente; 403 indica identidad válida sin permiso.
- El acceso por estado de confidencialidad queda bloqueado hasta aprobar su matriz específica.
