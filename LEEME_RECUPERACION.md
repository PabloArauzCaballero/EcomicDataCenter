# Recuperación temporal de una entrega de datos

Rama de transporte creada para recuperar tres paquetes JSON previamente entregados al usuario y adjuntarlos directamente a la conversación. No contiene ni modifica la aplicación, no se fusiona con main/dev, no se conecta a bases de datos ni despliega servicios. Los archivos descargados se validan mediante SHA-256 y sólo se guardan como artefactos temporales del trabajo.
