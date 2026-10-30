# Acta artículo 12 bis — versión 1

`art12bis-v1.docx` deriva de la plantilla entregada por el usuario,
CONTROLES ART 12 BIS EXTRANJERO ACTUALIZADA.docx.
SHA256 de la fuente: 6533caccb79c3f78773b89deaa810264bda7b350359f4e36626116c528c98f01

Solo word/document.xml fue modificado. Se sustituyeron datos de ejemplo y espacios
de campos por marcadores. La tipografía, texto normativo, tamaño oficio 8,5 × 13,
imágenes, relaciones y estilos originales se conservan. El sello utiliza ajuste
de texto a la izquierda y el bloque PDI permanece unido para evitar superposición
o firmas separadas cuando los datos son largos. Las firmas no se completan.

Cada acta utiliza la fecha del control en America/Santiago y la identidad guardada
en controls.acta_person al registrar, no los datos posteriores de la ficha.
La numeración, el nombre y grado PDI y las firmas siempre quedan en blanco,
incluso cuando una versión anterior del sistema guardó esos datos.
Los campos opcionales ausentes conservan líneas para completar manualmente.

Esta plantilla es inmutable una vez publicada. Para cambiar su contenido, agregar
una versión nueva y conservar esta para regenerar los controles históricos.
El servidor incluye el archivo mediante outputFileTracingIncludes; nunca se sirve
como archivo público. La descarga usa el mismo requireStaff que los controles.

Verificación: generación automática y descarga manual en navegador móvil;
Word original y generado renderizados con Microsoft Word, sin guardar la fuente;
caso habitual una página y caso largo dos páginas sin solapamiento.

## PDF con formato original

`art12bis-form-v1.pdf` procede de la exportación original de Microsoft Word
del mismo archivo fuente, con tamaño 612 × 936 pt. Se preservan el sello, encabezado,
negritas, subrayados, textos y posiciones. `scripts/prepare-acta-pdf.py` elimina
únicamente la fecha de ejemplo y el nombre y grado de Carabineros del ejemplo.
El PDF se rellena sin redistribuir el documento ni tocar la sección PDI o el folio.
Los valores que exceden el espacio disponible se remiten íntegros a un anexo.
El Word editable sigue usando los estilos y elementos OOXML de la versión 1.


## Primera página del Word: reporte de consulta

`pdi-consulta-v1.xml` reproduce como texto y tablas editables el formulario de la
imagen entregada el 29-10-2026. Se genera con `scripts/prepare-consulta-template.py`.
El ajuste del 30-10-2026 conserva la distribución del encabezado en el sector
superior izquierdo, cuerpo con sangría, tabla migratoria, aviso con cursivas,
negritas y subrayados y ubicación del bloque de distribución. El tamaño es
612 × 936 pt, Arial 11 y separación de líneas de 13,25 pt. Los campos se presentan
en mayúsculas y la fecha del reporte como DD.MMM.AA. Las posiciones se reconstruyen
desde la fotografía; no existe un original DOCX de PDI para cotejar sus medidas.
No incorpora los datos personales del controlado, iniciales manuscritas, firma ni
resultados migratorios del ejemplo. Por la petición de conservar el texto fijo
de la referencia, esta hoja reproduce «12° BIS, LEY N° 20.930» tal como aparece
en la foto; el acta de Carabineros conserva su propio texto sin cambios.

Permanecen vacíos el número de reporte, las casillas de porte de documento y
situación migratoria, los antecedentes migratorios, motivo, registra/corresponde
denuncia y expulsión vigente. La unidad es SUBCOMISARIA DE ASUNTOS MIGRATORIOS,
el tipo documental ACTA CONTROL IDENTIDAD y el número documental un guion.
La identidad y fechas proceden del snapshot y fecha del control; las observaciones
son las del mismo control. Sin apellidos separados, se conservan las etiquetas
de la plantilla y se remite a los apellidos registrados en un anexo identificado,
sin adivinar cómo separarlos. El sexo no registrado queda vacío.
Los datos de un control anterior no se completan a partir de una ficha editada después.

Las seis opciones del reporte son controles de contenido de casilla de Word
(`w14:checkbox`), marcables con un clic, sin macros ni protección de formulario.
Las opciones de porte de documento y situación migratoria se entregan desmarcadas;
solo el tipo de consulta 12 bis viene marcado. Se especifica Segoe UI Symbol tanto
en el contenido como en los estados marcado/desmarcado para evitar sustituciones
de símbolos al abrir el archivo. Las casillas se editan en la copia Word descargada.

Por petición posterior del usuario, el bloque inferior PDI incorpora el sello de
fondo y los textos editables NOMBRE FUNCIONARIO PDI, INSPECTOR y ENCARGADO DE GUARDIA.
Esos tres textos son editables en Word y no se obtienen de la cuenta del funcionario
de Carabineros ni cambian el snapshot del control. El sello se ancla detrás del texto
con 55 % de opacidad y conserva sus proporciones; no altera la paginación.
`pdi-sello.png` es una reproducción visual de referencia preparada con la herramienta
de edición de imágenes a partir del recorte adjunto por el usuario el 30-10-2026.
Instrucción de edición: aislar el sello morado, retirar papel, texto superpuesto y
trazos manuscritos, conservar el diseño y usar fondo transparente. No se inserta
la firma manuscrita del ejemplo. La imagen se incluye como recurso interno del Word;
el PDF de la Subcomisaría mantiene su plantilla propia.

El bloque final reproduce el último recorte solicitado: ILS, Distribución:
subrayado, - SUB. ASUNTOS MIGRATORIOS (1) y - Archivo (1) /.
Ambas cantidades usan la misma tabulación; la línea completa de Archivo va
subrayada, incluida la tabulación. ILS queda como texto editable del ejemplo.

El Word habitual contiene reporte, acta y fotografías (tres páginas). Los valores
que exceden el ancho de una línea se conservan completos en un anexo PDI-1;
se miden en mayúsculas para que ningún valor cambie la distribución del formulario.
El PDF sigue usando solo
el acta original de la Subcomisaría y las fotografías, sin el reporte de consulta.
