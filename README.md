# Mi Universo | Agenda — versión corregida 2.0.2

## Correcciones de funcionamiento
- Los formularios que se crean dentro de ventanas emergentes ahora conectan correctamente sus eventos de envío. Antes faltaba esa conexión, por eso los botones Guardar no ejecutaban el guardado.
- Formularios de personas, sesiones, experiencias, disponibilidad y configuración conectados al guardado de IndexedDB.
- Edición y eliminación de personas, sesiones y experiencias.
- Disponibilidad: agregar, editar y quitar horarios. Se valida que no haya dos horarios iguales en una misma fecha.
- Reservar un horario libre abre el formulario de sesión con fecha y hora precargadas.
- Se agregan los iconos PNG que declara el manifiesto PWA.
- Se conserva la base local `posibilidades_access` y las tablas existentes para no romper los datos de la versión anterior.

## Actualizar la aplicación ya publicada
1. Antes de reemplazar nada, exportá un respaldo desde la app actual (Más → Exportar respaldo).
2. Descomprimí el ZIP.
3. Abrí la carpeta del proyecto ya conectada a GitHub/Cloudflare en Visual Studio Code.
4. Reemplazá los archivos del proyecto por los de esta carpeta: `index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png` y `README.md`.
5. Guardá todo y publicá los cambios en el mismo repositorio/proyecto. No borres el sitio ni crees otro repositorio.
6. Para probar localmente, usá Live Server desde `index.html`. Para la versión publicada, abrí el mismo enlace HTTPS.
7. Si ves la versión anterior, cerrá la pestaña/app instalada y recargá el sitio. El service worker usa una caché nueva en esta versión.

## Pruebas recomendadas
- Personas: crear, editar, guardar cambios y eliminar.
- Sesiones: crear, editar, guardar, eliminar y exportar evento de calendario.
- Experiencias: crear, editar, eliminar y verlas en Próximas/Anteriores según la fecha.
- Agenda: cambiar de mes, elegir día, agregar disponibilidad, editar fecha/hora/tipo, quitar horario y reservarlo como sesión.
- Respaldo: exportar JSON e importarlo en una instalación de prueba.

## Datos y calendario
Los registros se guardan localmente en el navegador mediante IndexedDB. No se sincronizan entre dispositivos. Para migrar de equipo, exportá el respaldo e importalo en el otro. La acción Calendario genera un archivo `.ics` que el usuario debe abrir y confirmar para incorporarlo al calendario del dispositivo.

## Prueba local
No abras `index.html` con doble clic. Abrilo desde Visual Studio Code usando Live Server (por ejemplo `http://127.0.0.1:5500`).


Actualización 2.0.2: calendario con indicadores de disponibilidad/sesiones/experiencias; alta de ficha desde el formulario de sesión; cupos ocupados independientes de las fichas de asistentes; acción para agregar eventos al calendario del teléfono mediante compartir archivo de calendario cuando el navegador lo permite o Google Calendar como alternativa.
