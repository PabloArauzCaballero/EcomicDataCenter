# Exporta a CSV las tablas de la «estructura de establecimientos» del SNIS-VE.
#
#   C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -NoProfile `
#     -ExecutionPolicy Bypass -File scripts\places\export_snis_structure.ps1 `
#     -Mdb <carpeta>\transfer.mdb -OutDir <carpeta>\csv
#
# El SNIS publica cada gestion un `DEPTOSESTR_<año>.ves` (en snis.minsalud.gob.bo,
# seccion Software). Es un gabinete de Microsoft (`MSCF`): `tar -xf` de Windows lo
# abre y deja `transfer.sql`, que NO es SQL sino una base Access 97 (Jet 3).
# Copiarla como `.mdb` y leerla con el controlador Jet de 32 bits — el ACE de 64
# bits rechaza Jet 3 («creada con una version anterior»), por eso la ruta
# SysWOW64. Un lector de Jet en Python (`access-parser`) la lee, pero corre los
# campos de texto de largo fijo y mezcla columnas: no usarlo aqui.
param([Parameter(Mandatory = $true)][string]$Mdb, [Parameter(Mandatory = $true)][string]$OutDir)
New-Item -ItemType Directory -Force $OutDir | Out-Null
$connection = New-Object System.Data.Odbc.OdbcConnection("Driver={Microsoft Access Driver (*.mdb)};Dbq=$Mdb;")
$connection.Open()
$tables = $connection.GetSchema("Tables") | Where-Object { $_.TABLE_TYPE -eq "TABLE" } | ForEach-Object { $_.TABLE_NAME }
foreach ($table in $tables) {
  $command = $connection.CreateCommand()
  $command.CommandText = "SELECT * FROM [$table]"
  $rows = New-Object System.Data.DataTable
  $rows.Load($command.ExecuteReader())
  $rows | Export-Csv -NoTypeInformation -Encoding UTF8 -Path (Join-Path $OutDir "$table.csv")
  Write-Output "$table $($rows.Rows.Count)"
}
$connection.Close()
