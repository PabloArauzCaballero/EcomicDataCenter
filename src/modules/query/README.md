# Consulta estadística

Expone lectura paginada de observaciones actuales o históricas y el detalle de trazabilidad.

Las consultas SQL son constantes y parametrizadas. El cliente solo puede usar filtros y ordenamientos permitidos por schemas Zod; nunca envía nombres de tablas, columnas, joins ni fragmentos SQL. Las lecturas usan la credencial reader y DTOs explícitos.
