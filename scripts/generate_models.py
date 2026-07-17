#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'docs/model/model-catalog.json'
OUT = ROOT / 'src/database/models'


def pascal(value: str) -> str:
    return ''.join(part.capitalize() for part in value.split('_'))


def camel(value: str) -> str:
    first, *rest = value.split('_')
    return first + ''.join(part.capitalize() for part in rest)


def type_parts(raw_type: str) -> tuple[str, str]:
    base = raw_type.removesuffix('?')
    if base == 'uuid':
        return 'string', 'DataType.UUID'
    if base.startswith('varchar'):
        length = re.search(r'\((\d+)\)', base)
        return 'string', f'DataType.STRING({length.group(1)})' if length else 'DataType.STRING'
    if base.startswith('char'):
        length = re.search(r'\((\d+)\)', base)
        return 'string', f'DataType.CHAR({length.group(1)})' if length else 'DataType.CHAR'
    if base == 'text':
        return 'string', 'DataType.TEXT'
    if base == 'boolean':
        return 'boolean', 'DataType.BOOLEAN'
    if base == 'date':
        return 'string', 'DataType.DATEONLY'
    if base == 'timestamptz':
        return 'Date', 'DataType.DATE'
    if base == 'jsonb':
        return 'Record<string, unknown>', 'DataType.JSONB'
    if base in {'integer', 'smallint'}:
        return 'number', 'DataType.INTEGER' if base == 'integer' else 'DataType.SMALLINT'
    if base == 'bigint':
        return 'string', 'DataType.BIGINT'
    if base.startswith('numeric'):
        match = re.search(r'\((\d+),(\d+)\)', base)
        dtype = f'DataType.DECIMAL({match.group(1)}, {match.group(2)})' if match else 'DataType.DECIMAL'
        return 'string', dtype
    raise ValueError(f'Unsupported type: {raw_type}')


def render_model(entity: dict[str, object]) -> tuple[str, str]:
    table = str(entity['table'])
    schema = str(entity['package'])
    class_name = pascal(table) + 'Model'
    fields = entity['fields']
    assert isinstance(fields, list)

    body: list[str] = [
        "import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';",
        "import { Column, DataType, Model, Table } from 'sequelize-typescript';",
        '',
        f"@Table({{ tableName: '{table}', schema: '{schema}', timestamps: false, underscored: true }})",
        f'export class {class_name} extends Model<',
        f'  InferAttributes<{class_name}>,',
        f'  InferCreationAttributes<{class_name}>',
        '> {',
    ]

    for field in fields:
        assert isinstance(field, dict)
        column = str(field['field'])
        prop = camel(column)
        ts_type, dtype = type_parts(str(field['type']))
        nullable = bool(field['nullable'])
        primary = bool(field['primary_key'])
        unique = bool(field['unique'])
        options = [f"field: '{column}'", f'type: {dtype}', f'allowNull: {str(nullable).lower()}']
        if primary:
            options.append('primaryKey: true')
            if str(field['type']).removesuffix('?') == 'uuid':
                options.append('defaultValue: DataType.UUIDV4')
            elif str(field['type']).removesuffix('?') == 'bigint':
                options.append('autoIncrement: true')
        if unique:
            options.append('unique: true')
        body.append(f'  @Column({{ {", ".join(options)} }})')
        declared_type = f'{ts_type} | null' if nullable else ts_type
        if primary:
            declared_type = f'CreationOptional<{declared_type}>'
        body.append(f'  declare {prop}: {declared_type};')
        body.append('')

    body.append('}')
    filename = f'{table}.model.ts'
    return filename, '\n'.join(body) + '\n'


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    exports: list[str] = []
    model_names: list[str] = []
    for entity in data['entities']:
        filename, content = render_model(entity)
        (OUT / filename).write_text(content, encoding='utf-8')
        module = filename.removesuffix('.ts')
        class_name = pascal(str(entity['table'])) + 'Model'
        exports.append(f"export {{ {class_name} }} from './{module}';")
        model_names.append(class_name)
    (OUT / 'index.ts').write_text('\n'.join(exports) + '\n', encoding='utf-8')
    registry_import = ',\n  '.join(model_names)
    registry = (
        "import {\n  " + registry_import + "\n} from './index';\n\n"
        "export const DATABASE_MODELS = [\n  " + ',\n  '.join(model_names) + "\n] as const;\n"
    )
    (OUT / 'model.registry.ts').write_text(registry, encoding='utf-8')


if __name__ == '__main__':
    main()
