# Contratos HTTP

- `openapi.yaml`: contrato principal, validado como OpenAPI 3.0.3.
- `endpoints.md`: intención, permisos, transacciones y flujos.
- `scripts/build_openapi.py`: generación determinista del YAML.

No colocar reglas de negocio en esta carpeta. Cualquier cambio de ruta debe modificar controller, generador OpenAPI, colección Postman y pruebas contractuales en el mismo cambio.
