# Runbooks

Procedimientos operativos para despliegue, migraciones y rollback, backup/restore e incidentes. Deben adaptarse al proveedor final y ensayarse en staging antes de habilitar producción.

- [render-hosted-collector.md](render-hosted-collector.md) — backend en Render para el colector de ChatGPT autenticado con clave compartida (ADR-0016).
- [national-places-load.md](national-places-load.md) — construccion y carga del registro nacional de lugares (`NATIONAL_POI`, migracion 0073).
- [bolivia-health-poi-load.md](bolivia-health-poi-load.md) — sector salud del registro de lugares: farmacias, hospitales, postas y demas, leidos y clasificados de OpenStreetMap.
- [sie-schools-load.md](sie-schools-load.md) — unidades educativas del SIE, Ministerio de Educacion.
- [anh-fuel-stations-load.md](anh-fuel-stations-load.md) — estaciones de servicio licenciadas por la ANH.
- [cajeros-santa-cruz-load.md](cajeros-santa-cruz-load.md) — cajeros automaticos de Santa Cruz, y por que la cuarta fuente pedida no entro.
- [transport-places-load.md](transport-places-load.md) — puertos, aeropuertos, terminales y paradas de transporte, leidos de OpenStreetMap vía Overpass.
- [osm-places-expansion.md](osm-places-expansion.md) — ampliacion por rubros (agro, industria, mineria, cultura y deporte) desde OpenStreetMap, con jerarquia de familias.
- [santa-cruz-commerce-enrichment.md](santa-cruz-commerce-enrichment.md) — comercio, gastronomia y oficios de Santa Cruz de la Sierra desde OpenStreetMap, y por que la mayoria ya estaba cargada.
