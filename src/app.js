  require('dotenv').config();
  const express = require('express');
  const path = require('path');
  const helmet = require('helmet');
  const { admin, db, auth } = require('./firebase');
  const { requireAuth } = require('../middleware/auth');
  const { searchTokens, productKeywords } = require('./search');
  const { filterAndSortProducts, sortByCreatedAtDesc } = require('./catalog');
  const { hasValidImageSignature } = require('./validation');
  const { createRegistrationHandler } = require('./registration');
  const categories = ['Tecnología','Hogar','Ropa y accesorios','Deportes','Libros','Juguetes','Belleza','Otros'];
  const multer = require('multer');
  const { Readable } = require('stream');
  const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
}); 
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
  const clean = v => typeof v === 'string' ? v.trim() : '';
  const asyncRoute = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  const validUrl = value => {
    if (!value) return true;
    try { return ['http:', 'https:'].includes(new URL(value).protocol); }
    catch { return false; }
  };
  const notFound = message => Object.assign(new Error(message), { statusCode: 404 });
  const badRequest = message => Object.assign(new Error(message), { statusCode: 400 });
  const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(badRequest('Solo se permiten imágenes JPG, PNG o WebP.'));
  }
});

const uploadImage = file => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: 'vendeya/products', resource_type: 'image' },
    (error, result) => error
      ? reject(error)
      : resolve({
          url: result.secure_url,
          publicId: result.public_id
        })
  );
  Readable.from(file.buffer).pipe(stream);
});

  // 1. ESTADO Y CATEGORÍAS
  app.get('/api/health', (req, res) =>
    res.json({ estado: 'ok', mensaje: 'API VendeYa funcionando' }));

  // Firebase Web API keys are public client identifiers. Return this key to
  // the same-origin browser so Firebase Auth calls carry an allowed referrer.
  app.get('/api/config/firebase', (req, res) => {
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
      console.error('[firebase.config] code=FIREBASE_WEB_API_KEY_MISSING');
      return res.status(503).json({ error: 'Firebase Authentication no está configurado.' });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ apiKey, projectId: admin.app().options.projectId || null });
  });

  app.get('/api/categories', (req, res) => res.json({ categories }));
  app.get('/api/users/me', requireAuth, (req, res) => res.json({ user: req.user }));

  // 2. REGISTRO E INICIO DE SESIÓN
  app.post('/api/auth/register', createRegistrationHandler({ auth, db, admin }));

  // 3. PRODUCTOS: LISTAR, BUSCAR Y CONSULTAR
  app.get('/api/products', asyncRoute(async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 12);
    const minPrice = req.query.minPrice === undefined ? null : Number(req.query.minPrice);
    const maxPrice = req.query.maxPrice === undefined ? null : Number(req.query.maxPrice);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50)
      throw badRequest('Paginación inválida: page debe ser positivo y limit entre 1 y 50.');
    if ((minPrice !== null && (!Number.isFinite(minPrice) || minPrice < 0)) ||
        (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
        (minPrice !== null && maxPrice !== null && minPrice > maxPrice))
      throw badRequest('Rango de precios inválido.');

    const availability = clean(req.query.availability) || 'available';
    if (!['available', 'sold', 'all'].includes(availability))
      throw badRequest('Disponibilidad inválida.');
    const category = clean(req.query.category);
    const terms = searchTokens(clean(req.query.search));
    // Use Firestore's automatically indexed status field so catalog queries
    // remain usable even before optional composite indexes are deployed.
    const statuses = availability === 'all' ? ['available', 'sold'] : [availability];
    const snapshots = await Promise.all(statuses.map(status =>
      db.collection('products').where('status', '==', status).get()
    ));
    const allProducts = snapshots.flatMap(snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    const filteredProducts = filterAndSortProducts(allProducts, { category, minPrice, maxPrice, terms });
    const total = filteredProducts.length;
    const products = filteredProducts.slice((page - 1) * limit, page * limit);
    res.json({ products, pagination: {
      page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), capped: false
    } });
  }));

  app.get('/api/products/:id', asyncRoute(async (req, res) => {
    const snap = await db.collection('products').doc(req.params.id).get();
    if (!snap.exists || snap.data().status === 'deleted')
      return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json({ product: { id: snap.id, ...snap.data() } });
  }));

  // 5. PUBLICAR, EDITAR Y ELIMINAR PRODUCTOS
  
app.post('/api/products', requireAuth, upload.array('images', 5),
  asyncRoute(async (req, res) => {
    const title = clean(req.body.title);
    const description = clean(req.body.description);
    const category = clean(req.body.category);
    const price = Number(req.body.price);
    const files = req.files || [];

    if (title.length < 3 || title.length > 100 ||
        description.length < 5 || description.length > 1000 ||
        !categories.includes(category) ||
        !Number.isSafeInteger(price) || price <= 0 ||
        files.length < 1 || files.length > 5) {
      return res.status(400).json({
        error: 'Revisa los datos y selecciona entre 1 y 5 imágenes válidas.'
      });
    }

    if (files.some(file => !hasValidImageSignature(file))) {
      return res.status(400).json({ error: 'El contenido de cada archivo debe corresponder a una imagen JPG, PNG o WebP válida.' });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({
        error: 'Falta configurar el almacenamiento de imágenes.'
      });
    }

    const uploads = await Promise.allSettled(files.map(uploadImage));
    const failedUpload = uploads.find(result => result.status === 'rejected');
    if (failedUpload) {
      // Avoid orphaned Cloudinary images when one file in the batch fails.
      const uploadedImages = uploads
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
      await Promise.allSettled(uploadedImages.map(image =>
        cloudinary.uploader.destroy(image.publicId)
      ));
      const error = failedUpload.reason;
      console.error('[Cloudinary upload]', error.message || error);
      return res.status(502).json({ error: 'No se pudieron guardar las imágenes. Verifica Cloudinary e inténtalo de nuevo.' });
    }
    const images = uploads.map(result => result.value);

    let doc;
    try {
      doc = await db.collection('products').add({
      title,
      description,
      category,
      price,
      images: images.map(img => img.url),
      imageUrl: images[0].url,
      imagePublicIds: images.map(img => img.publicId),
      searchKeywords: productKeywords({ title, description, category }),
      sellerId: req.user.uid,
      sellerName: req.user.name || req.user.email,
      status: 'available',
      createdAt: timestamp(),
      updatedAt: timestamp()
      });
    } catch (error) {
      await Promise.allSettled(images.map(image => cloudinary.uploader.destroy(image.publicId)));
      console.error('[Firestore product create]', error.message || error);
      throw error;
    }

    res.status(201).json({
      mensaje: 'Producto publicado correctamente.',
      productId: doc.id,
      images: images.map(img => img.url)
    });
  })
);


  app.put('/api/products/:id', requireAuth, asyncRoute(async (req, res) => {
    const ref = db.collection('products').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Producto no encontrado.' });
    const p = snap.data();
    if (p.sellerId !== req.user.uid && req.user.role !== 'admin')
      return res.status(403).json({ error: 'No tienes permiso para editarlo.' });
    if (p.status === 'sold') return res.status(409).json({ error: 'Producto vendido.' });

    const update = {};
    if (req.body.title !== undefined) {
      const v = clean(req.body.title);
      if (v.length < 3 || v.length > 100) return res.status(400).json({ error: 'El nombre debe tener entre 3 y 100 caracteres.' });
      update.title = v;
    }
    if (req.body.description !== undefined) {
      const v = clean(req.body.description);
      if (v.length < 5 || v.length > 1000) return res.status(400).json({ error: 'La descripción debe tener entre 5 y 1.000 caracteres.' });
      update.description = v;
    }
    if (req.body.category !== undefined) {
      if (!categories.includes(req.body.category))
        return res.status(400).json({ error: 'Categoría inválida.' });
      update.category = req.body.category;
    }
    if (req.body.price !== undefined) {
      const v = Number(req.body.price);
      if (!Number.isSafeInteger(v) || v <= 0)
        return res.status(400).json({ error: 'El precio debe ser un entero positivo en COP.' });
      update.price = v;
    }
    if (req.body.imageUrl !== undefined) {
      if (!validUrl(req.body.imageUrl))
        return res.status(400).json({ error: 'URL de imagen inválida.' });
      update.imageUrl = clean(req.body.imageUrl);
    }
    if (['title', 'description', 'category'].some(field => update[field] !== undefined)) {
      update.searchKeywords = productKeywords({ ...p, ...update });
    }
    update.updatedAt = timestamp();
    await ref.update(update);
    res.json({ mensaje: 'Producto actualizado.' });
  }));

  app.delete('/api/products/:id', requireAuth, asyncRoute(async (req, res) => {
    const ref = db.collection('products').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Producto no encontrado.' });
    const p = snap.data();
    if (p.sellerId !== req.user.uid && req.user.role !== 'admin')
      return res.status(403).json({ error: 'No tienes permiso para eliminarlo.' });
    await ref.update({ status: 'deleted', updatedAt: timestamp() });
    res.json({ mensaje: 'Producto eliminado del catálogo.' });
  }));

  // 6. COMPRAS DE DEMOSTRACIÓN (NO REALIZA COBROS)
  app.post('/api/orders', requireAuth, asyncRoute(async (req, res) => {
    const productId = clean(req.body.productId);
    const deliveryAddress = clean(req.body.deliveryAddress);
    const paymentMethod = clean(req.body.paymentMethod);
    if (!productId) return res.status(400).json({ error: 'Indica el producto.' });
    if (deliveryAddress.length < 8 || deliveryAddress.length > 300)
      throw badRequest('Indica una dirección de entrega válida (8 a 300 caracteres).');
    if (paymentMethod !== 'demo')
      throw badRequest('La pasarela de pagos está pendiente; solo se admite el pedido demostrativo.');
    const productRef = db.collection('products').doc(productId);
    const orderRef = db.collection('orders').doc(`${productId}_${req.user.uid}`);

    await db.runTransaction(async tx => {
      const snap = await tx.get(productRef);
      if (!snap.exists || snap.data().status === 'deleted')
        throw notFound('Producto no encontrado.');
      const p = snap.data();
      if (p.status !== 'available')
        throw Object.assign(new Error('Producto no disponible.'), { statusCode: 409 });
      if (p.sellerId === req.user.uid)
        throw badRequest('No puedes solicitar tu propio producto.');
      const existingRequest = await tx.get(orderRef);
      if (existingRequest.exists)
        throw Object.assign(new Error('Ya enviaste una solicitud para este producto.'), { statusCode: 409 });
      tx.set(orderRef, {
        productId, productTitle: p.title, price: p.price,
        buyerId: req.user.uid, buyerEmail: req.user.email,
        sellerId: p.sellerId, sellerName: p.sellerName || '',
        deliveryAddress, paymentMethod, status: 'demo_request',
        paymentStatus: 'not_integrated', createdAt: timestamp()
      });
    });
    res.status(201).json({
      mensaje: 'Solicitud demostrativa registrada. No se realizó ningún pago y el producto sigue disponible.',
      orderId: orderRef.id
    });
  }));

  app.get('/api/seller/dashboard', requireAuth, asyncRoute(async (req, res) => {
    const [productSnapshot, salesSnapshot] = await Promise.all([
      db.collection('products').where('sellerId', '==', req.user.uid).get(),
      db.collection('orders').where('sellerId', '==', req.user.uid).get()
    ]);
    const sellerProducts = productSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const listedProducts = sortByCreatedAtDesc(sellerProducts
      .filter(product => ['available', 'sold'].includes(product.status)))
      .slice(0, 100);
    const active = sellerProducts.filter(product => product.status === 'available').length;
    const sold = sellerProducts.filter(product => product.status === 'sold').length;
    const paidSales = salesSnapshot.docs.filter(doc => doc.data().paymentStatus === 'paid').length;
    res.json({
      stats: { published: active + sold, active, sold, sales: paidSales },
      products: listedProducts
    });
  }));

  app.get('/api/orders', requireAuth, asyncRoute(async (req, res) => {
    const collection = db.collection('orders');
    const snaps = req.user.role === 'admin'
      ? [await collection.get()]
      : await Promise.all([
          collection.where('buyerId', '==', req.user.uid).get(),
          collection.where('sellerId', '==', req.user.uid).get()
        ]);
    const byId = new Map();
    snaps.forEach(snap => snap.docs.forEach(doc => byId.set(doc.id, { id: doc.id, ...doc.data() })));
    const orders = sortByCreatedAtDesc([...byId.values()]).slice(0, 300);
    res.json({ orders });
  }));

  app.get('/api/orders/:id', requireAuth, asyncRoute(async (req, res) => {
    const snap = await db.collection('orders').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Compra no encontrada.' });
    const o = snap.data();
    if (o.buyerId !== req.user.uid && o.sellerId !== req.user.uid &&
        req.user.role !== 'admin')
      return res.status(403).json({ error: 'No tienes permiso para ver esta compra.' });
    res.json({ order: { id: snap.id, ...o } });
  }));

  // 7. PAGOS, ENVÍOS, NOTIFICACIONES Y ADMINISTRACIÓN
  // Los endpoints de administración y servicios avanzados no estaban incluidos en el ZIP fuente.

  // 9. RUTAS NO ENCONTRADAS Y ERRORES
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/'))
      return res.status(404).json({ error: 'Endpoint no encontrado.' });
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), err => {
      if (err) next(err);
    });
  });

  app.use((err, req, res, next) => {
    const firestoreIndexMissing = err.code === 9 || err.code === 'FAILED_PRECONDITION';
    const firestorePermissionDenied = err.code === 7 ||
      err.code === 'PERMISSION_DENIED' || err.code === 'permission-denied';
    console.error(`[${req.method} ${req.path}] code=${err.code || 'UNKNOWN'} ${err.message}`);
    const multerStatus = err instanceof multer.MulterError
      ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      : 0;
    const databaseUnavailable = err.code === 14 || err.code === 'UNAVAILABLE' ||
      err.code === 'EACCES' || err.code === 'ECONNRESET';
    const status = Number(err.statusCode) || multerStatus ||
      (databaseUnavailable || firestoreIndexMissing || firestorePermissionDenied ? 503 : 500);
    const message = err instanceof multer.MulterError
      ? (err.code === 'LIMIT_FILE_SIZE'
        ? 'Cada imagen debe pesar máximo 5 MB.'
        : 'Selecciona hasta 5 imágenes válidas JPG, PNG o WebP.')
      : err.message;
    res.status(status).json({
      error: firestoreIndexMissing
        ? 'Firestore necesita índices compuestos. Despliega el archivo firestore.indexes.json del proyecto.'
        : firestorePermissionDenied
          ? 'Firebase rechazó guardar el producto por permisos. Revisa el acceso de escritura Firestore de la cuenta de servicio.'
        : databaseUnavailable
        ? 'No se pudo conectar con Firebase. Verifica la red y la configuración del proyecto.'
        : status >= 500
          ? 'Ocurrió un error en el servidor. Revisa la terminal.'
          : message
    });
  });

  module.exports = app;

