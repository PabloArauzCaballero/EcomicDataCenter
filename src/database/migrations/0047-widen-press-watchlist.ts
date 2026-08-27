import type { MigrationContext } from '../migration.types';

/**
 * Rebuilds the watched vocabulary over the widened article view.
 *
 * It lives in its own step because it is its own question. The view next door
 * asks "what is this story about"; this one asks "how often is the country
 * saying this word", and the answer has to be counted per term rather than
 * assigned once per story — a headline about diésel at a blockade counts under
 * both.
 *
 * The list grew with the subjects: remittances, the multilaterals, sugar,
 * pensions, royalties, electricity, public works and poverty are all things the
 * coverage names often enough to be worth watching, and none of them had a row.
 */

const termView = `
CREATE VIEW read_models.press_term_mention AS
WITH vocabulary(term, label, family, pattern) AS (
  VALUES
    ('DIESEL', 'Diésel', 'HIDROCARBUROS', ARRAY['%diésel%', '%diesel%']),
    ('GASOLINA', 'Gasolina', 'HIDROCARBUROS', ARRAY['%gasolina%']),
    ('YPFB', 'YPFB', 'HIDROCARBUROS', ARRAY['%ypfb%']),
    ('SUBVENCION', 'Subvención', 'HIDROCARBUROS',
      ARRAY['%subvención%', '%subvencion%', '%subsidio%']),
    ('SURTIDOR', 'Surtidores y filas', 'HIDROCARBUROS',
      ARRAY['%surtidor%', '%fila%', '%cola%']),
    ('DOLAR', 'Dólar', 'CAMBIARIO', ARRAY['%dólar%', '%dolar%']),
    ('TIPO_CAMBIO', 'Tipo de cambio', 'CAMBIARIO',
      ARRAY['%tipo de cambio%', '%brecha cambiaria%']),
    ('DIVISAS', 'Divisas', 'CAMBIARIO', ARRAY['%divisa%']),
    ('REMESAS', 'Remesas', 'CAMBIARIO', ARRAY['%remesa%']),
    ('RESERVAS', 'Reservas internacionales', 'MONETARIO',
      ARRAY['%reservas internacionales%', '%reservas del bcb%']),
    ('BCB', 'Banco Central', 'MONETARIO', ARRAY['%banco central%', '%bcb%']),
    ('CREDITO', 'Crédito y banca', 'MONETARIO',
      ARRAY['%crédito%', '%credito%', '%banca%', '%asfi%']),
    ('FMI', 'FMI y multilaterales', 'MONETARIO',
      ARRAY['%fmi%', '%fondo monetario%', '%banco mundial%', '%caf %', '%bid %']),
    ('INFLACION', 'Inflación', 'PRECIOS', ARRAY['%inflación%', '%inflacion%', '%ipc%']),
    ('CANASTA', 'Canasta y precios', 'PRECIOS',
      ARRAY['%canasta%', '%carestía%', '%carestia%', '%encarec%']),
    ('ESCASEZ', 'Escasez', 'PRECIOS',
      ARRAY['%escasez%', '%desabastecimiento%', '%acaparamiento%']),
    ('BLOQUEO', 'Bloqueos', 'CONFLICTO', ARRAY['%bloqueo%']),
    ('PARO', 'Paros y protestas', 'CONFLICTO',
      ARRAY['%paro %', '%protesta%', '%movilizac%', '%marcha%']),
    ('GREMIALES', 'Gremiales', 'CONFLICTO',
      ARRAY['%gremial%', '%transportista%', '%sindicat%']),
    ('CONTRABANDO', 'Contrabando', 'COMERCIO_EXTERIOR', ARRAY['%contrabando%']),
    ('EXPORTACION', 'Exportaciones', 'COMERCIO_EXTERIOR',
      ARRAY['%exportación%', '%exportacion%', '%exportador%']),
    ('IMPORTACION', 'Importaciones', 'COMERCIO_EXTERIOR',
      ARRAY['%importación%', '%importacion%', '%arancel%']),
    ('SOYA', 'Soya y oleaginosas', 'SECTOR_REAL',
      ARRAY['%soya%', '%oleagin%', '%girasol%']),
    ('GANADERIA', 'Ganadería', 'SECTOR_REAL',
      ARRAY['%ganader%', '%cabezas de ganado%', '%carne%']),
    ('MINERIA', 'Minería', 'SECTOR_REAL',
      ARRAY['%minería%', '%mineria%', '%minero%', '%litio%', '%oro %']),
    ('AGRO', 'Agro y cultivos', 'SECTOR_REAL',
      ARRAY['%maíz%', '%maiz%', '%sorgo%', '%arroz%', '%hectárea%', '%hectarea%']),
    ('AZUCAR', 'Azúcar y caña', 'SECTOR_REAL', ARRAY['%azúcar%', '%azucar%', '%caña%']),
    ('EMPLEO', 'Empleo y salarios', 'LABORAL',
      ARRAY['%empleo%', '%salario%', '%desempleo%', '%aguinaldo%']),
    ('JUBILACION', 'Jubilación y pensiones', 'LABORAL',
      ARRAY['%jubila%', '%pensión%', '%pension%', '%gestora%']),
    ('IMPUESTOS', 'Impuestos', 'FISCAL',
      ARRAY['%impuesto%', '%tributar%', '%impuestos nacionales%']),
    ('DEUDA', 'Deuda pública', 'FISCAL',
      ARRAY['%deuda %', '%bonos soberanos%', '%déficit%', '%deficit%']),
    ('REGALIAS', 'Regalías', 'FISCAL', ARRAY['%regalía%', '%regalia%']),
    ('INVERSION', 'Inversión', 'ACTIVIDAD',
      ARRAY['%inversión%', '%inversion%', '%inversor%']),
    ('ELECTRICIDAD', 'Electricidad', 'ENERGIA',
      ARRAY['%electricidad%', '%eléctric%', '%apagón%', '%apagon%', '%ende%']),
    ('OBRAS', 'Obras y caminos', 'INFRAESTRUCTURA',
      ARRAY['%carretera%', '%doble vía%', '%doble via%', '%puente%', '%aeropuerto%']),
    ('POBREZA', 'Pobreza y desigualdad', 'SOCIAL',
      ARRAY['%pobreza%', '%desigualdad%', '%desnutric%'])
)
SELECT
  vocabulary.term,
  vocabulary.label,
  vocabulary.family,
  article.fact_claim_id,
  article.event_date,
  article.outlet,
  article.topic,
  article.tone,
  article.region
FROM read_models.press_article article
JOIN vocabulary
  ON (coalesce(article.headline, '') || ' ' || coalesce(article.summary, ''))
     ILIKE ANY (vocabulary.pattern)
WHERE article.status = 'PUBLISHED' AND NOT article.superseded;
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.press_term_mention TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`DROP VIEW IF EXISTS read_models.press_term_mention;`);
  await context.sequelize.query(termView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`DROP VIEW IF EXISTS read_models.press_term_mention;`);
}
