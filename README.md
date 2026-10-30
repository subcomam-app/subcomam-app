# SUBCOMAM

Plataforma de registro de personas y controles para la Subcomisaría de Asuntos Migratorios de Carabineros. Implementada con Next.js, TypeScript y Supabase (PostgreSQL y Auth).

## Uso local

```powershell
npm install
npm run dev
```

Abrir http://127.0.0.1:3000. Las variables de conexión están en `.env.local`, excluido de Git. `.env.example` documenta las variables necesarias.

Todos los entornos requieren una cuenta. Las antiguas variables `LOCAL_DEV_ACCESS` y `TEMPORARY_PUBLIC_ACCESS` ya no conceden permisos, aunque sigan configuradas.

## Flujo

Interfaz minimalista optimizada para celular: navegación inferior hasta 800 px, formulario en una columna en pantallas pequeñas, campos de 16 px y botones de al menos 44 px. Domicilio, comuna y teléfono son obligatorios y están siempre visibles; los listados se presentan como fichas en móvil. Las fichas antiguas incompletas deben completarse antes de continuar. La migración `202610180007_required_contact.sql` guarda los datos de contacto y el nuevo control en una misma transacción. El panel de estadísticas adapta los filtros de fecha a pantallas de 320 px. La portada consulta personas solo al buscar un documento; los listados se cargan al abrir Personas o Historial.

1. Seleccionar RUT, DNI, pasaporte u otro documento. Los documentos distintos del RUT requieren país emisor. «Otro» requiere describir el documento.
2. Escribir al menos dos caracteres para recibir coincidencias. «Buscar persona» valida el documento completo y selecciona una coincidencia exacta.
3. Seleccionar una ficha para recuperar sus datos y último control, o crear una persona si el documento no está registrado.
4. Completar los datos del control y guardar. La creación de persona y control ocurre dentro de una transacción. La fecha se asigna en el servidor y se muestra en horario de Santiago.
5. El funcionario consulta sus controles y sus estadísticas. El administrador consulta el directorio y los controles de toda la unidad. Los listados tienen paginación; cada control tiene detalle y descargas según corresponda.

La identidad se distingue por tipo, país emisor y número normalizado. Un mismo número puede pertenecer a documentos de países distintos. No se fusionan personas automáticamente por nombre ni se modifican los datos de una ficha existente durante un control. La vinculación de documentos adicionales a una misma persona queda fuera de esta versión.

País emisor y nacionalidad utilizan el catálogo en español de `i18n-iso-countries`, fijado en 7.14.0, con nombres comunes y alias definidos en `src/lib/countries.ts`. Las sugerencias se filtran al escribir y admiten teclado o toque. Ambos campos comparten validación en cliente y servidor: tildes, mayúsculas y espacios no generan variantes, los alias conocidos se guardan con un único nombre y se rechazan errores de escritura, prefijos ambiguos y «Otro». La búsqueda de documentos también exige un país válido; no se modifican fichas históricas ni actas ya emitidas.

## Base de datos

Proyecto Supabase vinculado: `subcomam-app` (`yeqgtmwjmzpohyneumez`). La base estaba vacía al iniciar. La migración `supabase/migrations/202610170001_initial.sql` crea:

- `persons`: identificación y datos personales, con unicidad en la base.
- `controls`: historial, fecha del servidor y usuario que efectuó el registro.
- `person_summary`: vista con último control y cantidad de controles.
- `register_control`: transacción para guardar, con identificador de solicitud que evita duplicados al reintentar.

La migración inicial se aplicó mediante la API de administración de Supabase, ya que la conexión directa de la CLI quedó sin respuesta. No ejecutar nuevamente el SQL inicial en la base actual. En otra base vacía, ejecutar el archivo en el editor SQL de Supabase antes de iniciar la aplicación.

## Acceso en producción

### Portales separados

En Estadísticas, cada funcionario ve cinco totales de sus controles: hoy, semana actual desde el lunes, mes actual, año actual e histórico completo. El administrador ve esos mismos períodos en una tabla de todos los usuarios, incluyendo cuentas sin controles y un total de la unidad. Las fechas se calculan en `America/Santiago`, respetando los cambios de hora. El histórico no tiene el límite de 366 días del detalle por fechas personalizadas, que continúa disponible en una sección desplegable.

El gráfico de torta de nacionalidades permite alternar esos cinco períodos y muestra cantidades y porcentajes de controles, no personas únicas. Usa la nacionalidad conservada en cada acta; solo los registros antiguos sin esa información recurren a la ficha actual o a «Sin nacionalidad registrada». En móvil se muestran hasta ocho sectores; si hay más nacionalidades, se agrupan las menores y se ofrece el detalle completo. La migración `202610180011_nationality_statistics.sql` agrega estos totales al mismo resumen protegido por cuenta. Las pruebas de estadísticas verifican que sumen lo mismo que los totales generales y que las fichas editadas no cambien las nacionalidades históricas.

La migración `202610180012_control_interval_and_deletion.sql` exige ocho horas transcurridas entre controles de una misma persona, sin importar el funcionario. El formulario consulta la disponibilidad y muestra la hora del próximo control en Chile; un bloqueo por persona en PostgreSQL impide duplicados simultáneos y el servidor conserva los reintentos de una misma solicitud. La regla se aplica a nuevos controles y no modifica registros anteriores.

En el historial administrativo, la papelera permite eliminar un control erróneo con confirmación. `DELETE /api/controls/[id]` requiere administrador activo y origen válido; elimina el registro y sus dos imágenes privadas. Conserva la ficha y recalcula automáticamente estadísticas y disponibilidad usando los controles restantes. Un recibo privado registra quién eliminó el control y permite reintentar la limpieza de imágenes tras un fallo de red; la solicitud antigua no puede recrearlo. El funcionario debe iniciar un nuevo registro corregido. `npm run test:control-interval` verifica el límite exacto, concurrencia, permisos, limpieza, reintentos y reingreso con datos sintéticos.

La migración `202610180010_control_period_statistics.sql` agrupa por identificador de cuenta; cambiar el nombre o código no cambia la atribución ni mezcla funcionarios con nombres iguales. Los controles sin cuenta vigente conservan una fila histórica separada. `/api/account/statistics/summary` obtiene la cuenta exclusivamente de la sesión; `/api/admin/statistics/summary` exige administrador. La función SQL solo puede ejecutarse con el rol del servidor. `npm run test:statistics` verifica límites de calendario y cambio horario chileno, totales, cuentas sin actividad, separación por usuario, conservación histórica y denegaciones de acceso; crea y elimina sus propias cuentas y registros sintéticos.

`/` es el portal de funcionarios: ingreso por código, nuevo control, «Mis controles», fotografías y actas propias, y «Mis estadísticas». `/admin` es exclusivamente administrativo: ingreso por correo, estadísticas generales, controles y personas de toda la unidad y gestión de usuarios. El panel administrativo no contiene el formulario operativo. Una sesión que visita el portal incorrecto se redirige al correspondiente a su rol; las credenciales ingresadas en el acceso incorrecto se rechazan con una indicación del portal correcto.

Se retiró el acceso administrativo anónimo. Cada consulta o registro requiere una sesión real, incluso durante desarrollo. `GET /api/controls` filtra por `created_by` para funcionarios y las rutas de fotos, Word y PDF aplican el mismo filtro antes de leer un archivo. El directorio completo exige administrador. La migración `202610180003_portal_permissions.sql` aplica también el aislamiento en RLS y en la vista `person_summary`. Los registros antiguos sin autor identificado siguen disponibles únicamente al administrador.

La búsqueda de documentos durante un nuevo control continúa reutilizando fichas existentes de la unidad y mostrando la última fecha de control, para evitar duplicar personas. Esta búsqueda acotada no otorga acceso al historial, fotografías ni actas de otros funcionarios.

### Acceso autenticado

Las rutas de datos verifican una sesión de Supabase Auth y un rol `officer` o `admin` en `app_metadata`. No se admite alta pública desde la aplicación ni se utilizan contraseñas predeterminadas. El primer administrador se provisiona desde Supabase; los siguientes usuarios se gestionan en la plataforma.

El administrador mantiene su acceso por correo, separado de las cuentas de funcionarios, y accede a **Estadísticas** y **Gestión de usuarios**. Crea un funcionario indicando nombre, código único con formato `111111-M` (seis dígitos, guion y letra) y contraseña inicial de 6 a 128 caracteres. El funcionario ingresa con ese código y debe cambiar la contraseña inicial antes de consultar o registrar datos. No requiere correo ni confirmación por mail. Las cuentas administrativas se crean con nombre y correo; el administrador existente conserva sus credenciales.

El administrador también puede editar nombre, código y perfil, suspender/reactivar accesos y generar enlaces de recuperación. No puede suspenderse ni quitarse su propio perfil. Un disparador de base de datos conserva al menos un administrador activo. Los cambios de código conservan la identidad de la cuenta y sus estadísticas; los controles históricos conservan el código registrado en su momento.

Las acciones del listado de usuarios se muestran como iconos con etiquetas accesibles: editar, ver accesos, generar enlace y eliminar. La eliminación requiere confirmación, bloquea la propia cuenta administradora y conserva los controles, su autor original, fotografías y actas. La migración aplicada `202610180005_user_access_history.sql` registra los ingresos correctos por contraseña o recuperación; el administrador consulta el historial por usuario con fecha y hora de Chile. El historial comienza al activar esta función, sin inventar accesos anteriores. Su tabla solo es accesible desde el servidor después de verificar permisos.

Los campos de código de funcionario en creación, edición, ingreso y Mi cuenta agregan el guion y convierten la letra a mayúscula: `003466u` pasa a `003466-U`. El servidor aplica la misma normalización antes de buscar o guardar la cuenta, preservando ceros iniciales y la unicidad del código. No transforma correos.

**Mis estadísticas** muestra únicamente los controles de la cuenta autenticada: cantidad de controles, personas distintas, personas reiteradas, primer control de esa persona con el funcionario, evolución diaria y motivos, con filtro de fechas en horario de Chile. La atribución usa el identificador de la cuenta, aunque dos funcionarios tengan el mismo nombre. Al guardar un control autenticado, el servidor y un disparador asignan el nombre y código desde la cuenta; los campos enviados por el navegador no pueden cambiar esa atribución. Los controles antiguos sin autor identificado no se asignan automáticamente a ningún funcionario.

La migración `202610180002_officer_accounts.sql`, aplicada en Supabase, crea la tabla privada `staff_accounts`, mantiene los códigos únicos dentro de la transacción de Auth, agrega `controls.officer_code`, exige el cambio inicial también en RLS y crea `officer_statistics` para uso exclusivo del servidor. Supabase Auth utiliza internamente una dirección derivada del código en el dominio reservado `funcionarios.subcomam.invalid`; no es un correo del funcionario ni se utiliza para enviar mensajes.

**Mi cuenta** (`/cuenta`) permite a un usuario con sesión real cambiar su contraseña ingresando la actual y una nueva. El servidor verifica la contraseña mediante un ingreso reciente antes de actualizarla con Supabase Auth: no requiere un código ni confirmación por correo, incluso si la sesión anterior tiene más de 24 horas. La contraseña nueva debe ser distinta y tener de 6 a 128 caracteres. Se conserva una sesión válida mediante cookies HttpOnly; la API no devuelve contraseñas ni tokens. No se aceptan identificadores de otras cuentas en el cambio.

Si el usuario olvida la contraseña, el administrador puede compartirle de forma privada un enlace de recuperación. No se envía automáticamente por correo. El titular define una contraseña de al menos 6 caracteres en `/activar`. El token se transporta en el fragmento de la URL, se elimina del historial al abrir la página y se valida en el servidor mediante Supabase Auth. Cada enlace es de un solo uso y vence según la configuración de Auth. Se conserva compatibilidad con la creación administrativa por enlace (peticiones sin contraseña inicial); esas cuentas quedan pendientes hasta completar la activación. Las nuevas cuentas de funcionarios siempre requieren código y contraseña inicial.

La migración `202610170002_administration.sql`, ya aplicada, agrega estadísticas agregadas en PostgreSQL y permisos que consultan el estado actual de la cuenta. Una suspensión también revoca las lecturas directas con un JWT anterior. Las estadísticas filtran hasta 366 días inclusivos en `America/Santiago`: controles, personas distintas, fichas nuevas, personas con más de un control en el período, evolución diaria, motivos y hasta diez funcionarios. Los nombres de funcionario proceden del texto registrado en cada control; no representan una evaluación de desempeño.

La política RLS impide el acceso anónimo a tablas y vistas. Solo el servidor utiliza `SUPABASE_SERVICE_ROLE_KEY`, después de comprobar la sesión y los permisos. Las escrituras directas de clientes autenticados están revocadas. Los documentos se buscan mediante POST para no incluirlos en las URL. Las respuestas de datos usan `Cache-Control: no-store, private`.

## Dirección del control

Al entrar al paso del control se solicita la ubicación actual del dispositivo, con permiso del navegador, y se completa la dirección mediante Photon/OpenStreetMap. Se pide una posición nueva, con un máximo de 15 segundos de espera; una precisión peor de 200 metros requiere reintentar o escribir la dirección. El icono de ubicación permite repetir la detección. El funcionario puede corregir el texto y una respuesta tardía nunca reemplaza esa corrección. La dirección guardada se usa en el control y el acta.

`POST /api/location/reverse` exige una cuenta activa y solo acepta latitud y longitud. Al proveedor no se envían cuentas, documentos, personas ni fotos. Las consultas a la misma posición reutilizan datos del mapa durante 24 horas; el servicio puede cambiarse con `PHOTON_REVERSE_URL`. Se usa el [servicio Photon](https://github.com/komoot/photon#demo-server) para tráfico moderado y sin garantía de disponibilidad. Si no hay señal, permiso, conexión o calle reconocible, el campo sigue disponible para ingreso manual y no se asigna una dirección genérica.

## Fotografía por control

Cada control nuevo requiere una foto actualizada de la persona. La imagen del DNI, cédula, pasaporte u otro documento es opcional, pues la persona puede no portarlo. El funcionario confirma la foto de la persona y, solo si adjunta una imagen del documento, que corresponde al procedimiento y es legible. Se permite capturarlas en dispositivos compatibles o adjuntar JPG, PNG o WebP (hasta 20 MB y 30 megapíxeles por imagen antes de la preparación). El navegador reduce los archivos antes de enviarlos; el servidor valida el contenido real, corrige la orientación y elimina EXIF/GPS.

Los botones para fotografiar abren una vista dentro de la página y exigen la cámara trasera mediante `getUserMedia` con `facingMode: { exact: "environment" }`, sin solicitar micrófono. No se utiliza el selector nativo `capture`, que puede abrir selfies según el teléfono. Si la cámara trasera no está disponible o falta permiso, se informa el problema y se mantiene la opción de adjuntar; nunca se reintenta con la cámara frontal. La cámara se apaga al capturar, cancelar, salir del formulario o poner la página en segundo plano. Las capturas pasan por la misma compresión que las fotos adjuntas. La restricción obligatoria está descrita en [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode).

Al tomar o adjuntar una foto, el mismo flujo la comprime automáticamente en el dispositivo, con objetivo de 60 KiB y máximo de 100 KiB antes de enviarla. La interfaz muestra el tamaño original y el comprimido. Se reduce progresivamente la calidad y resolución; se usa JPEG comprimido si el navegador no puede codificar WebP. No se permite guardar mientras se prepara la imagen ni se envía el original como alternativa si la compresión falla.

El servidor verifica y guarda únicamente la versión WebP, con hasta 640 píxeles en el lado mayor, objetivo de 60 KiB y límite de 100 KiB. La compresión adapta calidad y resolución manteniendo al menos 480 píxeles en el lado mayor para originales más grandes. El tamaño exacto depende de la fotografía. El original no se almacena.

El documento conserva mayor resolución para que su texto sea legible: hasta 1600 píxeles en el lado mayor, objetivo de 180 KiB y máximo de 350 KiB. Ambas imágenes mantienen sus proporciones y se comprimen automáticamente tanto al capturarlas como al adjuntarlas.

Bucket Supabase: `control-photos`, privado, solo WebP, máximo 358400 bytes por objeto. La foto de la persona conserva su límite de 100 KiB. Las migraciones `202610170003_control_photos.sql` y `202610180008_document_photos.sql`, ya aplicadas, agregan las rutas y dimensiones/peso a cada control. Los registros anteriores se conservan sin inventarles fotografías; las restricciones se aplican a las inserciones nuevas. La migración `202610290001_optional_document_photo.sql` elimina únicamente la obligatoriedad de la imagen del documento; mantiene la integridad de sus metadatos y la foto obligatoria de la persona. La función transaccional verifica que cada imagen adjunta exista y pertenezca a la solicitud antes de crear persona y control. Las fotos usan una ruta autenticada sin caché; `?kind=document` devuelve el documento con los mismos permisos del control. No se publican URLs del bucket.

Cada intento de guardado utiliza rutas independientes para cada imagen adjunta. Los reintentos conservan el mismo control y sus imágenes, y se eliminan las subidas que pierden una carrera o cuya transacción fue rechazada. Si una respuesta de base de datos se pierde y no es posible confirmar el resultado, se conservan los objetos para evitar borrar fotos que pudieron quedar asociadas. Ese caso excepcional puede requerir revisar objetos sin control antes de eliminarlos; nunca se borran fotografías por una respuesta de red ambigua.

## Acta del artículo 12 bis

El formulario registra apellido paterno, apellido materno y sexo por separado.
Apellido paterno y sexo son obligatorios; el apellido materno puede quedar vacío
si la persona no tiene segundo apellido. No se deducen apellidos ni sexo desde
los registros antiguos: el funcionario debe completarlos en su siguiente control.
Los apellidos completos se derivan de ambos campos para conservar búsquedas,
historial y PDF. El Word usa los campos separados guardados en `acta_person`.
Una modificación posterior de la ficha no cambia documentos de controles anteriores.

Antes de publicar esta versión, aplicar en orden las migraciones pendientes
`202610290001_optional_document_photo.sql` y
`202610300001_person_report_details.sql`. La segunda añade los campos de la ficha,
actualiza la vista de búsqueda y guarda los datos personales junto al control en
una única transacción. La verificación local de SQL no sustituye aplicar las
migraciones en producción antes de activar el despliegue.

Para verificar las migraciones y el Word con PostgreSQL local en memoria, sin
crear cuentas ni registros reales:

```powershell
npm install --prefix .vercel/sql-qa --no-audit --no-fund @electric-sql/pglite
node --import tsx tests/person-details-sql.ts
```

Todos los controles nuevos corresponden al **artículo 12 bis**, sin casilla de selección.
Lesiones y documento de identidad presentado son obligatorios. El documento se muestra automáticamente con el tipo y número seleccionados al inicio; para corregirlo se vuelve al paso Documento. La API y la migración `202610180013_identity_document_consistency.sql` lo derivan de la identidad de la persona, ignorando descripciones incompatibles de clientes antiguos. PDF y Word usan esa misma identidad congelada, incluso si un control anterior tenía una descripción diferente. Las lesiones deben consignarse expresamente, incluyendo «Sin lesiones» cuando corresponda. La API y la migración `202610180009_required_acta_fields.sql` rechazan omisiones, valores vacíos y espacios en controles nuevos. Al descargar un acta histórica incompleta, las lesiones se muestran como «No consignadas», sin modificar el registro ni inferir ausencia de lesiones.
El número de acta, el nombre y grado PDI y las firmas siempre quedan en blanco,
también al descargar controles anteriores. La API ignora esos campos si los envía
un cliente antiguo; la migración `202610180006_pdi_fields_blank.sql` los vacía en nuevas inserciones.
El nombre, código y grado del funcionario se toman automáticamente de su cuenta.
El administrador gestiona el grado desde Usuarios, al crear o editar al funcionario.
Al guardar cualquier control aparecen dos opciones manuales de descarga. El PDF conserva
el acta de la Subcomisaría con su anexo fotográfico. El Word editable incorpora primero
el reporte de consulta de extranjero, seguido del acta y las fotografías. El comprobante
y el historial permiten repetir ambas descargas sin registrar otro control. Los registros
históricos que no tenían acta conservan sus datos originales.

La migración `202610180004_all_controls_art12bis.sql` hace obligatoria la vinculación
con la cuenta al insertar y registra siempre la identidad y versión del acta, incluso
si un cliente anterior omite sus campos. El grado procede de `app_metadata`, solo
editable por el administrador, y queda congelado en cada control junto al nombre y código.

La migración `202610180001_control_documents.sql`, aplicada en Supabase, conserva
una copia de la identidad en el momento del control y la versión de la plantilla.
La fecha y edad corresponden al día del control en Chile. Se mantienen las firmas
en blanco. La generación utiliza `assets/templates/art12bis-v1.docx` y la ruta
`GET /api/controls/[id]/document` (Word) y `?format=pdf` (PDF), con las mismas reglas de acceso que los controles
y sin caché. Las versiones publicadas de la plantilla deben conservarse.

El PDF utiliza `assets/templates/art12bis-form-v1.pdf`: la página original exportada
desde Word, con tamaño oficio 612 × 936 puntos, sello, texto y distribución intactos.
Solo se eliminaron la fecha y los datos de ejemplo del funcionario antes de rellenar.
Los campos se escriben en sus espacios con Liberation Sans, compatible en métricas
con Arial. Los valores excepcionales que no caben a un tamaño legible se conservan
completos en un anexo identificado desde el campo, sin alterar la primera página.

El registro fotográfico ocupa la segunda hoja del PDF y la tercera del Word: foto de la persona y, si se adjuntó, imagen del documento presentado, completas y sin recortar. Los anexos de texto excepcionalmente largo van después de esa hoja. Cada descarga recupera exclusivamente las imágenes asociadas al control. Si una imagen almacenada no se puede descargar, se informa un error para reintentar en vez de entregar un acta incompleta. Si no se adjuntó documento, la segunda hoja indica «No se adjuntó imagen del documento en este control», sin inferir que no se portaba. En controles históricos sin foto de la persona, se informa esa omisión.

`npm run test:documents` verifica el Word descargado, identidad histórica,
idempotencia y generación con los datos de la cuenta del funcionario. Requiere el servidor en
3001; crea su propia cuenta sintética. `TEST_BASE_URL` permite elegir otro servidor.
La prueba elimina solo sus registros y fotos sintéticos.

## Comandos de verificación

```powershell
npm test
npm run typecheck
npm run build
# Requiere el servidor local y las variables de .env.local:
npm run test:integration
# En una segunda terminal, ejecutar la compilación de producción en el puerto 3001
# con TEMPORARY_PUBLIC_ACCESS=false y sin LOCAL_DEV_ACCESS:
# $env:TEMPORARY_PUBLIC_ACCESS='false'
# npm run start -- --port 3001
npm run test:admin
npm run test:account
npm run test:officers
npm run test:photos
npm run test:access
```

Las pruebas de integración usan personas ficticias identificadas con un prefijo `QA`, verifican guardado, búsqueda, última fecha, historial, idempotencia concurrente, duplicados, validación y bloqueo anónimo. Eliminan únicamente los registros que ellas mismas crean.

`test:admin` verifica permisos por perfil, activación, enlace de un solo uso, cambios de rol, suspensión de sesiones existentes y RLS, recuperación y agregaciones en límites de fecha chilenos. Crea y elimina únicamente sus cuentas y datos temporales. Requiere al menos un administrador permanente y un servidor de producción sin el acceso local de desarrollo. `TEST_BASE_URL` permite seleccionar el despliegue a verificar.

`test:photos` verifica foto obligatoria, validación real de imagen, límites de carga, WebP sin EXIF, guardado concurrente, preservación de fotos anteriores, limpieza tras errores y acceso restringido al bucket y a las rutas de imagen. Las imágenes son sintéticas y se eliminan con sus controles y cuentas al finalizar.

`test:access` verifica que ninguna ruta de datos permita acceso anónimo. Puede ejecutarse con las antiguas variables de acceso temporal activas para demostrar que ya no conceden permisos. `TEST_BASE_URL` selecciona el servidor.

No contiene registros de ejemplo precargados ni decisiones automatizadas sobre la situación migratoria.

`test:account` comprueba creación manual por código, ingreso con clave inicial, cambio de contraseña propia sin correo, rechazo de contraseñas incorrectas, aislamiento entre cuentas, CSRF y suspensión. Usa credenciales aleatorias y elimina solo las cuentas que crea. `/api/account` y `/api/account/password` siempre requieren la sesión real.

`test:officers` verifica formato y unicidad del código, acceso administrativo por correo, bloqueo previo al cambio inicial (API y RLS), sustitución de la contraseña inicial, atribución automática e inalterable del control y estadísticas aisladas para dos funcionarios con el mismo nombre. Comprueba el rechazo de credenciales en el portal incorrecto, la visibilidad completa del administrador, el historial propio, PDF/Word/fotos propios, RLS por autor y que cambiar el código conserva las estadísticas e historial. Usa `TEST_BASE_URL` (por defecto puerto 3000). Elimina únicamente sus cuentas, personas, controles y fotografías sintéticas.

