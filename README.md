# VendeYa

Tienda entre personas para descubrir, publicar y comprar productos. El catálogo permite buscar por texto y filtrar por categoría, disponibilidad y rango de precio. El checkout actual registra solicitudes demostrativas, no procesa pagos ni marca productos como vendidos. Para ventas reales falta configurar e integrar una pasarela de pago con confirmación verificada por el servidor.

## Requisitos y configuración

- Node.js 20 o superior.
- Proyecto de Firebase con Authentication (proveedor **Email/Password** habilitado) y Firestore.
- Una clave JSON de **Firebase Admin SDK** para el servidor, con `project_id`, `client_email` y `private_key`. La ruta de `GOOGLE_APPLICATION_CREDENTIALS` debe apuntar a ese archivo de cuenta de servicio, no a una configuración de Firestore.
- Cuenta de Cloudinary para publicar imágenes.

Copia `.env.example` a `.env` y completa las variables. Guarda la credencial de Firebase fuera del repositorio y configura `GOOGLE_APPLICATION_CREDENTIALS` con su ruta local; en Vercel usa `FIREBASE_SERVICE_ACCOUNT_JSON`. Nunca agregues credenciales reales al código.

```powershell
npm install
npm start
```

Abre `http://localhost:3000`. Ejecuta `npm test` para las verificaciones incluidas. El registro y el inicio de sesión necesitan `FIREBASE_WEB_API_KEY`, correspondiente al mismo proyecto que la cuenta de servicio; el proveedor Email/Password debe estar activo en Firebase Console. La publicación necesita las tres variables de Cloudinary.

## Firestore

La API usa Firebase Admin SDK y `firestore.rules` niega lecturas y escrituras desde clientes directos. La configuración del proyecto declara reglas e índices en `firebase.json`; despliega con `firebase deploy --only firestore:rules,firestore:indexes`. Si ya tienes productos guardados antes de la indexación de búsqueda, revisa `node scripts/reindex-products.js` y aplica el proceso solo cuando hayas confirmado la actualización de datos.

## Vercel

Configura esta carpeta como raíz del proyecto. `vercel.json` sirve la aplicación desde `public/` y dirige `/api/*` a `api/index.js`. Define `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_WEB_API_KEY` y `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. El proyecto no se ha desplegado desde esta entrega.

## Historias de usuario

1. Crear cuenta e iniciar/cerrar sesión con Firebase Authentication.
2. Publicar un producto con descripción, categoría, precio e imágenes, y retirar una publicación propia.
3. Buscar productos y filtrar por categoría, precio y disponibilidad.
4. Consultar el detalle y registrar una solicitud demostrativa; no se confirma una venta ni se procesa pago. La integración de pagos reales está pendiente.

Consulta [`docs/API.md`](docs/API.md) para las rutas reales y [`docs/architecture/`](docs/architecture/) para los diagramas.
