# POSIBILIDADES · MicroApp v1

Aplicación web progresiva (PWA) para organizar personas, sesiones, clases y seguimientos. Los registros se guardan en el dispositivo del usuario mediante IndexedDB. No hay cuentas, base de datos central ni backend.

## Archivos
- `index.html`: estructura y navegación
- `styles.css`: diseño adaptable a teléfono y computadora
- `app.js`: funciones y almacenamiento local
- `manifest.json`, `icon.svg`, `sw.js`: instalación y uso sin conexión

## Publicación gratuita
1. Creá un repositorio en GitHub y subí **el contenido** de esta carpeta (no el ZIP).
2. En Cloudflare Pages, elegí crear un proyecto conectado a GitHub y seleccioná el repositorio.
3. Para un sitio estático, dejá el comando de build vacío y el directorio de salida como `/` o `.` según la interfaz.
4. Publicá y probá la URL que Cloudflare te dé. Podés asignar un subdominio `*.pages.dev`.
5. Probá la instalación desde un teléfono real y desde una computadora antes de vender.

## Importante sobre los datos
- Cada navegador/dispositivo tiene su propia base de datos local; no hay sincronización automática entre teléfono y computadora.
- Exportá copias desde **Datos y ajustes** y guardalas en un lugar seguro.
- Si borrás los datos del navegador o perdés el dispositivo, los datos no exportados podrían perderse.
- El código puede actualizarse manteniendo el mismo esquema de IndexedDB. Si en una versión futura cambia el esquema, se debe preparar una migración explícita.
- Para instalación PWA, el sitio publicado debe usar HTTPS. En iPhone/iPad, la instalación suele hacerse desde Safari → Compartir → Agregar a pantalla de inicio.
- La primera apertura necesita conexión para cargar los archivos. Luego puede funcionar con el shell almacenado en caché, pero enlaces externos (WhatsApp/Instagram) necesitan conexión.

## Antes de comercializar
Probá todos los flujos en Android, iPhone/Safari y escritorio. Esta carpeta es una base funcional v1, pero no equivale a una certificación de ausencia de errores ni a una auditoría de seguridad.
