# API de VendeYa

El frontend de `public/index.html` carga `public/app.js`, que llama a la API Express de `src/app.js`. En desarrollo ambos usan `http://localhost:3000`; Vercel enruta `/api/*` a `api/index.js`. Las rutas privadas requieren `Authorization: Bearer <Firebase ID token>`.

## Historias de usuario

- **HU-01 · Cuenta:** `POST /api/auth/register`, `POST /api/auth/login` y `GET /api/users/me`.
- **HU-02 · Publicación:** `POST /api/products`, `PUT /api/products/:id` y `DELETE /api/products/:id`. Crear y modificar requiere autenticación; solo el propietario puede cambiar o retirar su producto.
- **HU-03 · Explorar:** `GET /api/categories`, `GET /api/products` y `GET /api/products/:id`.
- **HU-04 · Compra:** `POST /api/orders`, `GET /api/orders` y `GET /api/orders/:id`. El flujo actual solo registra solicitudes demostrativas; no confirma pagos ni ventas.

## Rutas disponibles

| Método y ruta | Entrada | Acceso | Resultado |
|---|---|---|---|
| `GET /api/health` | — | Público | Estado de la API. |
| `GET /api/categories` | — | Público | Categorías habilitadas. |
| `POST /api/auth/register` | `{name,email,password,phone}` | Público | Crea la cuenta y entrega sesión Firebase. Contraseña: 8 caracteres, mayúscula, minúscula y número. |
| `POST /api/auth/login` | `{email,password}` | Público | Inicia sesión; requiere `FIREBASE_WEB_API_KEY`. |
| `GET /api/users/me` | Bearer token | Sesión | Perfil asociado al UID del token. |
| `GET /api/products` | `search,category,minPrice,maxPrice,availability,page,limit` | Público | Catálogo paginado. `availability`: `available` (predeterminado), `sold` o `all`; `limit` máximo 50. |
| `GET /api/products/:id` | ID de producto | Público | Detalle; productos retirados devuelven 404. |
| `POST /api/products` | Multipart: `title,description,category,price,images` | Sesión | Publica de 1 a 5 imágenes JPG, PNG o WebP, máximo 5 MB cada una; requiere Cloudinary. |
| `PUT /api/products/:id` | Campos editables en JSON | Propietario | Actualiza un producto no vendido. |
| `DELETE /api/products/:id` | ID de producto | Propietario | Retiro lógico de la publicación. |
| `POST /api/orders` | `{productId,deliveryAddress,paymentMethod:"demo"}` | Sesión | Solicitud demostrativa con `paymentStatus: not_integrated`. Una transacción rechaza productos no disponibles, solicitudes propias y solicitudes duplicadas del mismo comprador. No procesa pago ni cambia el producto a vendido. |
| `GET /api/orders` | Bearer token | Sesión | Historial del usuario como comprador y vendedor (hasta 300 recientes por rol). |
| `GET /api/orders/:id` | ID de pedido | Comprador o vendedor del pedido | Detalle del pedido. |
| `GET /api/seller/dashboard` | Bearer token | Sesión | Conteos reales de publicaciones activas, vendidas y pagos confirmados; lista hasta 100 publicaciones recientes. |

Los errores usan `{ "error": "mensaje" }`. El servidor valida los datos nuevamente; el frontend no sustituye esas validaciones. Firestore requiere los índices de `firestore.indexes.json`, desplegables con `firebase deploy --only firestore:indexes`.

## Ejemplos

```http
GET /api/products?search=chaqueta&category=Ropa%20y%20accesorios&minPrice=20000&maxPrice=150000&availability=available&page=1&limit=12
```

```http
POST /api/orders
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json

{"productId":"ID_PRODUCTO","deliveryAddress":"Calle 10 # 20-30, Bogotá","paymentMethod":"demo"}
```

Las solicitudes son demostrativas; no se piden ni almacenan datos de tarjetas. Para confirmar ventas hace falta integrar una pasarela, verificar en backend la aprobación y entonces actualizar el pedido y producto dentro de una operación consistente.
