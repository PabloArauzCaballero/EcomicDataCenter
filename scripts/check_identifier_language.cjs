const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  process.stderr.write(`${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}\n`);
  process.exit(1);
}

const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const spanishTerms = new Set([
  'archivo',
  'calidad',
  'cantidad',
  'codigo',
  'consulta',
  'dato',
  'datos',
  'descripcion',
  'detalle',
  'estado',
  'fecha',
  'fuente',
  'fuentes',
  'medida',
  'medidas',
  'nombre',
  'observacion',
  'observaciones',
  'organizacion',
  'periodo',
  'regla',
  'reglas',
  'resultado',
  'resultados',
  'revision',
  'usuario',
  'usuarios',
  'valor',
  'valores',
]);
const violations = [];

function identifierTokens(identifier) {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/u)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

for (const file of parsedConfig.fileNames.filter((name) => name.endsWith('.ts'))) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );

  function visit(node) {
    if (ts.isIdentifier(node)) {
      const identifier = node.text;
      const containsNonAscii = /[^\u0000-\u007f]/u.test(identifier);
      const forbiddenTerms = identifierTokens(identifier).filter((token) =>
        spanishTerms.has(token),
      );
      if (containsNonAscii || forbiddenTerms.length > 0) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(
          `${path.relative(root, file)}:${position.line + 1}:${position.character + 1} ` +
            `identifier '${identifier}' must use English terminology`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

if (violations.length > 0) {
  process.stderr.write(`Identifier language validation failed:\n- ${violations.join('\n- ')}\n`);
  process.exit(1);
}

process.stdout.write('PASS: maintained TypeScript identifiers use English terminology.\n');
