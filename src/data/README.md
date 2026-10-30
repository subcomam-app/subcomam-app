# Comunas de Chile

`chile-communes.json` contiene 346 nombres únicos, consultados el 30-10-2026.
El catálogo se incluye en la aplicación y no se consulta una API al escribir.

Fuentes oficiales:

- [SUBDERE / IDE MOP, capa Comunas de la DPA](https://rest-sit.mop.gob.cl/arcgis/rest/services/INTEROP/SERVICIO_DPA/MapServer/1): se extrajo el campo `COMUNA` de sus 345 registros, sin geometrías. La propia fuente indica que su cartografía no incluye el territorio antártico.
- [CMF, tabla de comunas](https://www.cmfchile.cl/institucional/seil/certificacion_comunas.php): se incorporó Antártica, ausente en la capa geográfica. No se copiaron las categorías históricas Santiago Norte, Santiago Oeste ni Santiago Sur.
- [SII, tabla de comunas](https://zeus.sii.cl/avalu_cgi/br/brch10.sh): contraste de denominaciones alternativas, como Aysén/Aisén, La Calera/Calera, Llay-Llay/Llaillay, Paihuano/Paiguano, Marchigüe/Marchihue y San Francisco de Mostazal/Mostazal.

Se conservan los nombres de la DPA. `communes.ts` admite las variantes indicadas,
mayúsculas, espacios y ausencia de tildes, pero siempre devuelve el nombre del
catálogo. Las variantes de puntuación de O'Higgins y Tiltil son equivalencias
ortográficas. No se infieren comunas a partir de localidades o prefijos ambiguos.
Los datos históricos no se modifican masivamente: el formulario valida la comuna
al completar o actualizar los datos de contacto del siguiente control.
