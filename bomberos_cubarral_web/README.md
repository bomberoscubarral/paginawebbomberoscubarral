# Cuerpo de Bomberos Voluntarios de Cubarral Meta

Sitio institucional moderno para publicar noticias, verificar certificados y centralizar accesos rápidos.

## Qué incluye
- Inicio institucional con misión, visión, historia, servicios y cobertura.
- Noticias y comunicados con panel administrativo.
- Verificación digital de certificados por NIT o identificación.
- Descarga de PDF y código QR de validación.
- Formulario de solicitud de inspección que abre WhatsApp con el mensaje listo.
- Base preparada para ampliaciones: directorio, PQR, transparencia, gestión documental y capacitaciones.

## Arquitectura
- Frontend: React + Vite.
- Hosting: GitHub Pages.
- Backend: Firebase Authentication, Firestore y Storage.
- Seguridad: reglas de Firestore/Storage, autenticación con correo y contraseña, y roles por token personalizado.

## Antes de empezar
1. Crear proyecto en Firebase.
2. Activar **Authentication > Email/Password**.
3. Crear Firestore y Storage.
4. Implementar reglas.
5. Cargar el sitio en GitHub y publicar con GitHub Pages.

Las guías oficiales de Firebase indican activar Email/Password en Authentication y proteger Firestore/Storage con Security Rules. GitHub Pages permite publicar sitios desde un repositorio o con un flujo de GitHub Actions. citeturn930058search0turn930058search2turn930058search5turn930058search6turn930058search12

## Configuración del proyecto
Crea un archivo `.env` con tus datos de Firebase:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Cómo dar rol de administrador
La regla de seguridad espera `request.auth.token.role == "admin"`.

Tienes dos opciones:
- usar **custom claims** en un usuario administrado desde un script de servidor;
- o adaptar la regla para leer una colección `admins/{uid}` si prefieres manejar permisos desde Firestore.

## Estructura de Firestore
- `news`
  - `title`
  - `publishedAt`
  - `content`
  - `imageUrl`
  - `createdAt`
- `certificates_public`
  - `nit`
  - `name`
  - `issueDate`
  - `expiryDate`
  - `status`
  - `pdfUrl`
  - `qrCodeId`
- `inspection_requests`
  - `name`
  - `nit`
  - `contactName`
  - `phone`
  - `address`
  - `activity`
  - `observation`
  - `createdAt`

## Cómo desplegar en GitHub Pages
1. Sube el proyecto a un repositorio.
2. Ejecuta `npm install`.
3. Ejecuta `npm run build`.
4. Publica la carpeta `dist` con GitHub Pages o con GitHub Actions.

GitHub explica que Pages puede publicarse desde un repositorio y que los despliegues con CI suelen usar la carpeta de salida y, en muchos casos, la rama `gh-pages`; también documenta el uso de dominios personalizados. citeturn930058search3turn930058search6turn930058search16

## Ajustes recomendados para producción
- Cambiar `123` por la línea real de emergencia.
- Reemplazar los enlaces de Facebook, Instagram, TikTok y YouTube.
- Cargar los certificados y noticias desde el panel.
- Configurar la verificación de correo de administradores.
- Revisar que solo usuarios autorizados tengan `role=admin`.

## Nota sobre WhatsApp
Desde una web estática, lo normal es abrir el chat de WhatsApp con el texto diligenciado. El envío totalmente automático requiere una integración adicional con la API de WhatsApp Business o un backend propio.
