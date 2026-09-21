# Recuperación temporal de archivos para entrega directa

Esta rama contiene únicamente el transporte de tres ZIP de datos ya entregados. No se debe fusionar con main ni dev. No descarga ni ejecuta código de los ZIP, no usa secretos, no contacta bases de datos y no realiza despliegues. Los archivos se descargan con TLS normal y se cotejan con sus tamaños y SHA-256 anteriores. Los artefactos del trabajo caducan en un día; se recuperan mediante la conexión de GitHub para adjuntarlos directamente al chat.
