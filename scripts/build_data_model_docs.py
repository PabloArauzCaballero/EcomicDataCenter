from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'docs/model/model-catalog.json').read_text(encoding='utf-8'))
ENTITIES = CATALOG['entities']

DESCRIPTIONS = {
    'provenance': 'Quién produjo el dato, de dónde se obtuvo y qué lote lo incorporó.',
    'semantic': 'Definiciones, códigos, clasificaciones, geografía, unidades y frecuencias.',
    'metadata': 'Operaciones estadísticas, metodologías, estructuras, datasets y sus versiones.',
    'statistics': 'Indicadores, series, observaciones, revisiones, medidas y atributos.',
    'quality_lineage': 'Reglas, evaluaciones, incidencias, linaje, relaciones y rupturas de serie.',
}

def tex(value):
    return str(value).replace('\\', r'\textbackslash{}').replace('_', r'\_').replace('&', r'\&').replace('%', r'\%').replace('#', r'\#')

def plantuml_entity(entity):
    lines = [f'entity "{entity["table"]}" as {entity["alias"]} {{']
    for field in entity['fields']:
        marker = '*' if field['primary_key'] else ''
        tags = f' <<{field["tags"]}>>' if field['tags'] else ''
        lines.append(f'  {marker}{field["field"]} : {field["type"]}{tags}')
    lines.append('}')
    return '\n'.join(lines)

def build_schema_diagrams():
    source = (ROOT / 'systemInfo/relationalModel.puml').read_text(encoding='utf-8')
    relation_lines = [line for line in source.splitlines() if re.search(r'\|[|o]|o\{', line) and '--' in line]
    entity_package = {entity['alias']: entity['package'] for entity in ENTITIES}
    for package in DESCRIPTIONS:
        entities = [entity for entity in ENTITIES if entity['package'] == package]
        aliases = {entity['alias'] for entity in entities}
        relations = []
        for line in relation_lines:
            names = re.findall(r'[A-Za-z_][A-Za-z0-9_]*', line.split(':', 1)[0])
            if len(names) >= 2 and names[0] in aliases and names[1] in aliases:
                relations.append(line)
        content = ['@startuml', 'hide methods', 'hide stereotypes', 'skinparam shadowing false', f'title Schema {package}', '']
        content.extend(plantuml_entity(entity) for entity in entities)
        content.append('')
        content.extend(relations)
        content.append('@enduml')
        (ROOT / f'docs/data-model/schemas/{package}.puml').write_text('\n'.join(content) + '\n', encoding='utf-8')

    overview = ['@startuml', 'skinparam componentStyle rectangle', 'skinparam shadowing false', 'title Modelo por schemas', '']
    for package, description in DESCRIPTIONS.items():
        count = sum(1 for entity in ENTITIES if entity['package'] == package)
        overview.append(f'package "{package}" {{\n  component "{count} tablas" as {package}_tables\n}}')
    overview.extend([
        'provenance_tables --> metadata_tables : fuentes y productores',
        'semantic_tables --> metadata_tables : definiciones',
        'metadata_tables --> statistics_tables : estructura y versiones',
        'statistics_tables --> quality_lineage_tables : evaluación y linaje',
        '@enduml',
    ])
    (ROOT / 'docs/data-model/domain-model-by-schema.puml').write_text('\n'.join(overview) + '\n', encoding='utf-8')
    (ROOT / 'docs/data-model/relational-model-by-schema.puml').write_text(source, encoding='utf-8')
    view = '''@startuml
skinparam shadowing false
title Vistas y proyecciones
entity "read_models.current_observation_value" as current_view {
  observation_id : bigint
  series_id : uuid
  dataset_version_id : uuid
  period_start : date
  period_end : date
  observation_revision_id : bigint
  revision_number : integer
  confidentiality_status : varchar
  source_artifact_id : uuid
}
statistics.observation --> current_view
statistics.observation_revision --> current_view
statistics.series --> current_view
@enduml
'''
    (ROOT / 'docs/data-model/views-and-projections.puml').write_text(view, encoding='utf-8')

def build_tex():
    lines = [r'''\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[spanish]{babel}
\usepackage[a4paper,margin=2cm]{geometry}
\usepackage{longtable,booktabs,array,xcolor,hyperref}
\hypersetup{colorlinks=true,linkcolor=blue,urlcolor=blue}
\title{Modelo físico del Observatorio Económico y de Mercados de Bolivia}
\author{Documento técnico generado desde el catálogo validado}
\date{15 de julio de 2026}
\begin{document}
\maketitle
\tableofcontents
\newpage
\section{Lectura rápida}
El modelo funciona como una biblioteca estadística auditable: procedencia identifica el origen; semántica define el significado; metadatos fija metodología y estructura; estadísticas conserva valores y revisiones; calidad y linaje explica validaciones y transformaciones. Ninguna cifra publicada se sobrescribe silenciosamente.
\section{Criterios físicos}
La implementación usa PostgreSQL con schemas separados, claves foráneas, restricciones de estado, índices parciales para versiones actuales, credenciales reader/writer separadas y migraciones versionadas. Los objetos de aplicación no se crean en \texttt{public}.
''']
    for package, description in DESCRIPTIONS.items():
        lines.append(f'\\section{{Schema \\texttt{{{tex(package)}}}}}')
        lines.append(tex(description))
        for entity in [e for e in ENTITIES if e['package'] == package]:
            lines.append(f'\\subsection{{\\texttt{{{tex(entity["table"])}}}}}')
            lines.append(f'Tabla técnica del dominio \\texttt{{{tex(package)}}}. Su identidad se conserva mediante la clave primaria y sus relaciones se validan por migraciones PostgreSQL.')
            lines.append(r'\begin{longtable}{>{\raggedright\arraybackslash}p{0.26\textwidth} p{0.18\textwidth} p{0.12\textwidth} p{0.34\textwidth}}')
            lines.append(r'\toprule Campo & Tipo & Nulo & Restricciones \\ \midrule\endhead')
            for field in entity['fields']:
                tags = field['tags'] or '---'
                lines.append(f'\\texttt{{{tex(field["field"])}}} & \\texttt{{{tex(field["type"])}}} & {"Sí" if field["nullable"] else "No"} & {tex(tags)} \\\\')
            lines.append(r'\bottomrule\end{longtable}')
    lines.extend([r'''\section{Vistas y proyecciones}
\texttt{read\_models.current\_observation\_value} estabiliza la lectura de la revisión publicada actual sin permitir escrituras. Las consultas históricas continúan leyendo las revisiones base mediante fecha de corte para preservar reproducibilidad.
\section{Glosario}
\begin{description}
\item[Serie] Combinación única de dimensiones no temporales.
\item[Observación] Periodo de una serie.
\item[Revisión] Versión publicada o rechazada del valor observado.
\item[Vintage] Fecha desde la cual una revisión estaba disponible.
\item[Linaje] Relación verificable entre un dato fuente y uno derivado.
\end{description}
\section{Nota didáctica}
Una cifra sin fuente, metodología, versión y fecha de disponibilidad no es un dato reproducible; es solo un número. El modelo conserva esas cuatro piezas como parte del núcleo.
\end{document}
'''])
    (ROOT / 'docs/data-model/data-model.tex').write_text('\n'.join(lines), encoding='utf-8')

if __name__ == '__main__':
    build_schema_diagrams()
    build_tex()
