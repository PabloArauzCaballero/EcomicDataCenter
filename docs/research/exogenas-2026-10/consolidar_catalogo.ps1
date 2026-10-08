$ErrorActionPreference = 'Stop'
$planDir = $PSScriptRoot
$requiredFields = @('id','sector','variable','definicion','unidad','frecuencia','geografia','canal','rezago_hipotesis','fuente_url','prioridad','rol','disponibilidad')
$catalogFiles = @(
  @{ File = 'catalogo_macro.csv'; Mesa = 'Macroeconomia y finanzas' },
  @{ File = 'catalogo_produccion.csv'; Mesa = 'Produccion y recursos' },
  @{ File = 'catalogo_servicios.csv'; Mesa = 'Servicios y territorio' }
)
$allRows = [System.Collections.Generic.List[object]]::new()
$summary = [System.Collections.Generic.List[object]]::new()
$validationErrors = [System.Collections.Generic.List[string]]::new()
$missingSources = [System.Collections.Generic.List[string]]::new()
$roleMap = @{
  'condicionante'='CONDICIONANTE'; 'endogena'='RESULTADO'; 'exogena'='EXTERNO_CANDIDATO';
  'TRANSMISION'='CONDICIONANTE'; 'RESULTADO'='RESULTADO'; 'EXTERNA'='EXTERNO_CANDIDATO';
  'EXPOSICION'='EXPOSICION'; 'EXTERNA_CONDICIONAL'='EXTERNO_CONDICIONAL';
  'EVENTO_LOCAL_ENDOGENO'='EVENTO_LOCAL_ENDOGENO'; 'POLITICA_LOCAL'='POLITICA_LOCAL'
}

foreach ($entry in $catalogFiles) {
  $rows = @(Import-Csv -LiteralPath (Join-Path $planDir $entry.File) -Encoding UTF8)
  if ($rows.Count -eq 0) { throw "Catalogo vacio: $($entry.File)" }
  $actualFields = @($rows[0].PSObject.Properties.Name)
  if (($actualFields -join ',') -ne ($requiredFields -join ',')) { throw "Columnas inesperadas: $($entry.File)" }
  foreach ($row in $rows) {
    foreach ($field in $requiredFields) {
      if ($field -ne 'fuente_url' -and [string]::IsNullOrWhiteSpace($row.$field)) {
        $validationErrors.Add("Campo vacio: $($row.id).$field")
      }
    }
    if ($row.id -notmatch '^[A-Z][A-Z0-9_]+$') { $validationErrors.Add("ID invalido: $($row.id)") }
    if ($row.prioridad -notin @('P0','P1','P2')) { $validationErrors.Add("Prioridad invalida: $($row.id)") }
    if ([string]::IsNullOrWhiteSpace($row.fuente_url)) {
      $missingSources.Add($row.id)
    } else {
      $uri = $null
      if (-not [uri]::TryCreate($row.fuente_url, [System.UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('https','http')) {
        $validationErrors.Add("URL no valida: $($row.id)")
      }
    }
    $record = [ordered]@{}
    foreach ($field in $requiredFields) { $record[$field] = $row.$field }
    # Correspondencia exacta para categorias compartidas. Los roles mixtos no se infieren por palabras.
    $record['rol_filtro'] = if ($roleMap.ContainsKey($row.rol)) { $roleMap[$row.rol] } else { 'POR_DEFINIR_SEGUN_OBJETIVO' }
    $record['mesa_origen'] = $entry.Mesa
    $record['estado_integracion'] = 'CANDIDATA_POR_CONCILIAR_CON_MODULOS_EXISTENTES'
    $allRows.Add([pscustomobject]$record)
  }
  $summary.Add([pscustomobject]@{
    archivo=$entry.File
    mesa=$entry.Mesa
    familias=$rows.Count
    prioridades=@($rows | Group-Object prioridad | Sort-Object Name | ForEach-Object { [pscustomobject]@{prioridad=$_.Name;familias=$_.Count} })
  })
}
$duplicates = @($allRows | Group-Object id | Where-Object { $_.Count -gt 1 } | Select-Object -ExpandProperty Name)
foreach ($id in $duplicates) { $validationErrors.Add("ID duplicado: $id") }
if ($validationErrors.Count -gt 0) { throw ($validationErrors -join "`n") }

$allRows | Export-Csv -LiteralPath (Join-Path $planDir 'catalogo_consolidado.csv') -NoTypeInformation -Encoding UTF8
$result = [ordered]@{
  alcance='Validacion estructural del catalogo de investigacion; no valida series, APIs, acceso, licencias ni cobertura historica'
  familias=$allRows.Count
  identificadoresUnicos=@($allRows.id | Sort-Object -Unique).Count
  errores=$validationErrors.Count
  fuentesPendientes=@($missingSources)
  rolesFiltro=@($allRows | Group-Object rol_filtro | Sort-Object Name | ForEach-Object { [pscustomobject]@{rol=$_.Name;familias=$_.Count} })
  urlsDistintas=@($allRows.fuente_url | Where-Object { $_ } | Sort-Object -Unique).Count
  prioridades=@($allRows | Group-Object prioridad | Sort-Object Name | ForEach-Object { [pscustomobject]@{prioridad=$_.Name;familias=$_.Count} })
  mesas=@($summary)
  nota='No se deduplicaron conceptos automaticamente: familias amplias pueden solaparse; EXO-001 debe determinar reutilizacion, ampliacion, fusion o alta nueva.'
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $planDir 'validacion_catalogo.json') -Encoding UTF8
$result | ConvertTo-Json -Depth 8
