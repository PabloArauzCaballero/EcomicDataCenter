const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', 'dist']);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith('.ts')) files.push(target);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'test'));
walk(path.join(root, 'scripts'));
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
process.stdout.write(`PASS: ${files.length} TypeScript files parsed and transpiled.\n`);
