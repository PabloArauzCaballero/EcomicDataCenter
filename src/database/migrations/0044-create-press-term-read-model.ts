import type { MigrationContext } from '../migration.types';

/**
 * Counts the terms an economist watches, across the press coverage held.
 *
 * A watchlist, not a word count. Ranking every word in a corpus surfaces
 * "gobierno" and "Bolivia" and tells a reader nothing they did not already
 * know; what changes a judgement is whether *diésel* is being said more often
 * than *dólar* this week, and by whom. So the vocabulary is curated and
 * visible here, and a term that matters and is missing is a line to add rather
 * than a model to retrain.
 *
 * One article can mention several terms and is counted under each: this
 * measures attention to a subject, not a partition of the corpus, so the counts
 * deliberately sum to more than the number of articles.
 *
 * Matching is on the headline and standfirst — the part every outlet publishes
 * — and never on the body, which only some of them serve. Counting a term that
 * one outlet's full text mentions and another's does not would measure which
 * outlet is verbose rather than what the country is talking about.
 */

const dropView = `DROP VIEW IF EXISTS read_models.press_term_mention;`;

const termView = `
CREATE VIEW read_models.press_term_mention AS
WITH vocabulary(term, label, family, pattern) AS (
  VALUES
    ('DIESEL', 'Diésel', 'HIDROCARBUROS', ARRAY['%diésel%', '%diesel%']),
    ('GASOLINA', 'Gasolina', 'HIDROCARBUROS', ARRAY['%gasolina%']),
    ('YPFB', 'YPFB', 'HIDROCARBUROS', ARRAY['%ypfb%']),
    ('SUBVENCION', 'Subvención', 'HIDROCARBUROS', ARRAY['%subvención%', '%subvencion%', '%subsidio%']),
    ('SURTIDOR', 'Surtidores y filas', 'HIDROCARBUROS', ARRAY['%surtidor%', '%fila%', '%cola%']),
    ('DOLAR', 'Dólar', 'CAMBIARIO', ARRAY['%dólar%', '%dolar%']),
    ('TIPO_CAMBIO', 'Tipo de cambio', 'CAMBIARIO', ARRAY['%tipo de cambio%', '%brecha cambiaria%']),
    ('DIVISAS', 'Divisas', 'CAMBIARIO', ARRAY['%divisa%']),
    ('RESERVAS', 'Reservas internacionales', 'MONETARIO', ARRAY['%reservas internacionales%', '%reservas del bcb%']),
    ('BCB', 'Banco Central', 'MONETARIO', ARRAY['%banco central%', '%bcb%']),
    ('CREDITO', 'Crédito y banca', 'MONETARIO', ARRAY['%crédito%', '%credito%', '%banca%', '%asfi%']),
    ('INFLACION', 'Inflación', 'PRECIOS', ARRAY['%inflación%', '%inflacion%', '%ipc%']),
    ('CANASTA', 'Canasta y precios', 'PRECIOS', ARRAY['%canasta%', '%carestía%', '%carestia%', '%encarec%']),
    ('ESCASEZ', 'Escasez', 'PRECIOS', ARRAY['%escasez%', '%desabastecimiento%', '%acaparamiento%']),
    ('BLOQUEO', 'Bloqueos', 'CONFLICTO', ARRAY['%bloqueo%']),
    ('PARO', 'Paros y protestas', 'CONFLICTO', ARRAY['%paro %', '%protesta%', '%movilizac%', '%marcha%']),
    ('GREMIALES', 'Gremiales', 'CONFLICTO', ARRAY['%gremial%', '%transportista%', '%sindicat%']),
    ('CONTRABANDO', 'Contrabando', 'COMERCIO_EXTERIOR', ARRAY['%contrabando%']),
    ('EXPORTACION', 'Exportaciones', 'COMERCIO_EXTERIOR', ARRAY['%exportación%', '%exportacion%', '%exportador%']),
    ('IMPORTACION', 'Importaciones', 'COMERCIO_EXTERIOR', ARRAY['%importación%', '%importacion%', '%arancel%']),
    ('SOYA', 'Soya y oleaginosas', 'SECTOR_REAL', ARRAY['%soya%', '%oleagin%', '%girasol%']),
    ('GANADERIA', 'Ganadería', 'SECTOR_REAL', ARRAY['%ganader%', '%cabezas de ganado%', '%carne%']),
    ('MINERIA', 'Minería', 'SECTOR_REAL', ARRAY['%minería%', '%mineria%', '%minero%', '%litio%', '%oro%']),
    ('AGRO', 'Agro y cultivos', 'SECTOR_REAL', ARRAY['%maíz%', '%maiz%', '%sorgo%', '%arroz%', '%hectárea%', '%hectarea%']),
    ('EMPLEO', 'Empleo y salarios', 'LABORAL', ARRAY['%empleo%', '%salario%', '%desempleo%', '%aguinaldo%']),
    ('IMPUESTOS', 'Impuestos', 'FISCAL', ARRAY['%impuesto%', '%tributar%', '%impuestos nacionales%']),
    ('DEUDA', 'Deuda pública', 'FISCAL', ARRAY['%deuda %', '%bonos soberanos%', '%déficit%', '%deficit%']),
    ('INVERSION', 'Inversión', 'ACTIVIDAD', ARRAY['%inversión%', '%inversion%', '%inversor%'])
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
FROM read_models.press_article AS article
JOIN vocabulary
  ON coalesce(article.headline, '') || ' ' || coalesce(article.summary, '')
     ILIKE ANY (vocabulary.pattern)
WHERE article.status = 'PUBLISHED'
  AND NOT article.superseded;
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
  await context.sequelize.query(dropView);
  await context.sequelize.query(termView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
}
