# C4 — Módulos y flujo principal

Mermaid no expresa de forma normativa el nivel C4 de código. Este diagrama de módulos documenta los archivos principales y sus relaciones.

```mermaid
classDiagram
  class PublicIndex {
    +renderizarInterfaz()
  }
  class PublicApp {
    +api(path, options)
    +loadProducts()
    +submitAuth(event)
    +submitProduct(event)
    +buyProduct(id)
    +loadOrders()
  }
  class ExpressApp {
    +GET /api/products
    +POST /api/products
    +POST /api/orders
    +auth routes
  }
  class AuthMiddleware {
    +requireAuth(req, res, next)
    +requireAdmin(req, res, next)
  }
  class FirebaseModule {
    +admin
    +auth
    +db
  }
  class VercelHandler {
    +export ExpressApp
  }
  class LocalServer {
    +listen(PORT)
  }
  PublicIndex --> PublicApp : carga
  PublicApp --> ExpressApp : fetch /api
  ExpressApp --> AuthMiddleware : protege rutas
  ExpressApp --> FirebaseModule : Auth y Firestore
  VercelHandler --> ExpressApp : reutiliza
  LocalServer --> ExpressApp : reutiliza
```

El flujo actual de `POST /api/orders` comprueba disponibilidad y registra una solicitud demostrativa dentro de una transacción Firestore. No cambia el estado del producto, no cobra y guarda `status: demo_request` junto con `paymentStatus: not_integrated`. El producto permanece disponible hasta que exista una pasarela integrada y el pago se confirme en el servidor.
