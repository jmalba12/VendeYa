# C1 — Contexto del sistema

```mermaid
C4Context
  title VendeYa — Contexto
  Person(buyer, "Comprador", "Busca productos y registra compras de demostración")
  Person(seller, "Vendedor", "Publica y administra sus productos")
  Person(adminUser, "Administrador", "Puede consultar pedidos y gestionar publicaciones mediante permisos administrativos")
  System(market, "VendeYa", "Aplicación web de compraventa entre personas")
  System_Ext(firebaseAuth, "Firebase Authentication", "Cuentas y validación de credenciales")
  System_Ext(firestore, "Cloud Firestore", "Perfiles, productos y pedidos")
  System_Ext(cloudinary, "Cloudinary", "Almacenamiento de imágenes de producto")
  Rel(buyer, market, "Explora, compra en modo demostración")
  Rel(seller, market, "Publica y gestiona productos")
  Rel(adminUser, market, "Gestiona publicaciones y consulta pedidos con permisos administrativos")
  Rel(market, firebaseAuth, "Crea usuarios, inicia sesión y verifica ID tokens")
  Rel(market, firestore, "Lee y escribe mediante Firebase Admin SDK")
  Rel(market, cloudinary, "Sube imágenes al publicar")
```

La integración de pagos no está conectada; las compras registradas son demostrativas.

## Compartir en Mermaid.ai

1. Abre [Mermaid.ai](https://mermaid.ai) y crea un diagrama nuevo.
2. Copia el bloque Mermaid de cada archivo de esta carpeta en el editor compatible.
3. Revisa el render y usa la opción de compartir/publicar de Mermaid.ai.
4. Pega aquí el enlace público real cuando lo hayas publicado: **Pendiente de publicación**.

No se ha publicado ningún diagrama desde este proyecto.
