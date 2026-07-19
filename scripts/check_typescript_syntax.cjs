const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  const message = ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n');
  process.stderr.write(`FAIL tsconfig.json: ${message}\n`);
  process.exit(1);
}

const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const files = parsedConfig.fileNames.filter((file) => file.endsWith('.ts'));
let failed = false;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  });
  for (const diagnostic of result.diagnostics || []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    failed = true;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    process.stderr.write(`FAIL ${path.relative(root, file)}: ${message}\n`);
  }
}

if (failed) process.exit(1);
process.stdout.write(`PASS: ${files.length} maintained TypeScript files parsed and transpiled.\n`);
