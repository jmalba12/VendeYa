  const $ = id => document.getElementById(id);
  const state = {
    token: sessionStorage.getItem('vendeyaToken') || '',
    user: JSON.parse(sessionStorage.getItem('vendeyaUser') || 'null'),
    categories: [], page: 1, pages: 1, products: []
  };
  const COP = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  });
  const MAX_IMAGES = 5, MAX_SIZE = 5 * 1024 * 1024;
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  let images = [], previewUrls = [], toastTimer, selectedProduct = null;

  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
  }
  function message(id, msg, error = false) {
    $(id).textContent = msg;
    $(id).classList.toggle('error', error);
  }
  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[c]);
  }
  async function api(path, options = {}, authToken = state.token) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData))
      headers['Content-Type'] = 'application/json';
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    let res;
    try { res = await fetch(path, { ...options, headers }); }
    catch {
      const guidance = window.location.protocol === 'file:'
        ? 'Abre VendeYa desde http://localhost:3000; la página abierta como archivo no puede conectarse a la API.'
        : 'No se pudo conectar con el servidor de VendeYa. Verifica que esté iniciado y vuelve a intentarlo.';
      throw Error(guidance);
    }
    const data = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor.' }));
    if (!res.ok) {
      if (res.status === 401 && state.token) logout(false);
      throw Error(data.error || 'Ocurrió un error.');
    }
    return data;
  }
  let firebaseApiKey = '';
  async function getFirebaseApiKey() {
    if (!firebaseApiKey) {
      const config = await api('/api/config/firebase', {}, '');
      firebaseApiKey = config.apiKey || '';
      if (!firebaseApiKey) throw Error('Firebase Authentication no está configurado.');
    }
    return firebaseApiKey;
  }
  async function firebaseAuth(action, payload) {
    const key = await getFirebaseApiKey();
    let response;
    try {
      response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), referrerPolicy: 'strict-origin-when-cross-origin' }
      );
    } catch {
      throw Error('No se pudo conectar con Firebase Authentication. Revisa tu conexión e inténtalo de nuevo.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.error?.message || '';
      const messages = {
        EMAIL_EXISTS: 'Ese correo ya está registrado.',
        EMAIL_NOT_FOUND: 'No existe una cuenta con ese correo.',
        INVALID_PASSWORD: 'El correo o la contraseña no son correctos.',
        INVALID_LOGIN_CREDENTIALS: 'El correo o la contraseña no son correctos.',
        OPERATION_NOT_ALLOWED: 'Email/Password no está habilitado en Firebase Authentication.',
        API_KEY_SERVICE_BLOCKED: 'Google bloqueó la clave para Identity Toolkit. Revisa que FIREBASE_WEB_API_KEY sea la clave web del proyecto vendey-dd32d y que Identity Toolkit API esté permitida.',
        API_KEY_HTTP_REFERRER_BLOCKED: 'El dominio de VendeYa no está autorizado en las restricciones de la clave de Firebase.'
      };
      throw Error(messages[code] || 'Firebase Authentication rechazó la solicitud. Revisa los datos e inténtalo de nuevo.');
    }
    return data;
  }
  function setAuthUI() {
    const signed = Boolean(state.token && state.user);
    $('accountActions').classList.toggle('hidden', signed);
    $('signedInActions').classList.toggle('hidden', !signed);
    $('myListingsLink').classList.toggle('hidden', !signed);
    $('mySalesLink').classList.toggle('hidden', !signed);
    $('sellerDashboard').classList.toggle('hidden', !signed);
    $('ordersSection').classList.toggle('hidden', !signed);
    $('welcomeText').textContent = signed ? `Hola, ${state.user.name || state.user.email}` : '';
    $('productForm').querySelectorAll('input,textarea,select').forEach(el => el.disabled = !signed);
    updateButton();
  }
  function showAuth(mode = 'login') {
    setAuthMode(mode);
    $('accountSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function setAuthMode(mode) {
    const reg = mode === 'register';
    $('nameField').classList.toggle('hidden', !reg);
    $('phoneField').classList.toggle('hidden', !reg);
    $('authName').required = reg;
    $('authPhone').required = reg;
    $('confirmPasswordField').classList.toggle('hidden', !reg);
    $('authConfirmPassword').required = reg;
    $('loginTab').classList.toggle('active', !reg);
    $('registerTab').classList.toggle('active', reg);
    $('authSubmit').textContent = reg ? 'Crear cuenta' : 'Iniciar sesión';
    $('authPassword').autocomplete = reg ? 'new-password' : 'current-password';
    message('authMessage', '');
  }
  async function loadCategories() {
    try {
      state.categories = (await api('/api/categories')).categories || [];
    } catch {
      state.categories = ['Tecnología','Hogar','Ropa y accesorios','Deportes','Libros','Juguetes','Belleza','Otros'];
    }
    $('categoryFilter').replaceChildren(new Option('Todas las categorías', ''));
    $('productCategory').replaceChildren(new Option('Selecciona una categoría', ''));
    state.categories.forEach(c => {
      $('categoryFilter').add(new Option(c, c));
      $('productCategory').add(new Option(c, c));
    });
  }
  function date(v) {
    const s = v && (v._seconds || v.seconds);
    return s ? new Date(s * 1000).toLocaleDateString('es-CO') : 'Fecha reciente';
  }
  async function loadProducts() {
    const grid = $('productGrid');
    grid.innerHTML = '<div class="empty-state">Cargando productos…</div>';
    const q = new URLSearchParams({ page: String(state.page), limit: '12' });
    [['search','searchInput'],['category','categoryFilter'],['availability','availabilityFilter'],['minPrice','minPrice'],['maxPrice','maxPrice']]
      .forEach(([k,id]) => { const v = $(id).value.trim(); if (v) q.set(k,v); });
    try {
      const result = await api('/api/products?' + q);
      const products = result.products || [];
      state.products = products;
      state.pages = result.pagination?.pages || 1;
      $('pageStatus').textContent = 'Página ' + state.page + ' de ' + state.pages;
      $('prevPage').disabled = state.page <= 1;
      $('nextPage').disabled = state.page >= state.pages;
      $('productCount').textContent = `${products.length} productos`;
      grid.innerHTML = products.length ? products.map(p => {
        const img = p.imageUrl || (Array.isArray(p.images) && p.images[0]) || '';
        return `<article class="product-card"><div class="product-image">${
          img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}" loading="lazy" onerror="this.remove()">` : '<span class="image-placeholder">✳</span>'
        }<span class="product-category">${escapeHtml(p.category || 'Otros')}</span></div>
        <div class="product-info"><h3>${escapeHtml(p.title)}</h3>
        <p class="product-desc">${escapeHtml(p.description || 'Sin descripción')}</p>
        <div class="product-price">${COP.format(Number(p.price) || 0)}</div>
        <div class="product-meta"><span>Por ${escapeHtml(p.sellerName || 'Usuario')}</span><span>${p.status === 'sold' ? 'Vendido' : date(p.createdAt)}</span></div>
        <div class="product-actions"><button class="btn btn-ghost" data-detail="${escapeHtml(p.id)}">Ver detalle</button>
        ${state.user && p.sellerId === state.user.uid ? `<button class="btn btn-ghost" data-delete="${escapeHtml(p.id)}">Retirar</button>` : ''}</div></div></article>`;
      }).join('') : '<div class="empty-state">No hay productos que coincidan.</div>';
    } catch (e) {
      grid.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
      $('productCount').textContent = 'No disponible';
    }
  }

  function validateEmail() {
    const value = $('authEmail').value.trim();
    const ok = !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    $('emailHint').textContent = value && !ok ? 'Escribe un correo con formato nombre@dominio.com.' : '';
    $('authEmail').setAttribute('aria-invalid', String(!ok));
    return ok && Boolean(value);
  }
  function validatePassword() {
    const value = $('authPassword').value;
    const reg = !$('confirmPasswordField').classList.contains('hidden');
    const ok = reg ? value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) : Boolean(value);
    $('passwordHint').textContent = !value ? (reg ? 'Usa 8 caracteres, mayúscula, minúscula y número.' : '') : !reg || ok ? '' : 'Agrega 8 caracteres, mayúscula, minúscula y número.';
    $('authPassword').setAttribute('aria-invalid', String(Boolean(value) && !ok));
    validateConfirmation();
    return ok;
  }
  function validateConfirmation() {
    const reg = !$('confirmPasswordField').classList.contains('hidden');
    const value = $('authConfirmPassword').value;
    const ok = !reg || value === $('authPassword').value;
    $('confirmPasswordHint').textContent = !reg || !value ? '' : ok ? 'Las contraseñas coinciden.' : 'Las contraseñas no coinciden.';
    $('authConfirmPassword').setAttribute('aria-invalid', String(!ok));
    return ok;
  }
  function showProduct(id) {
    selectedProduct = state.products.find(item => item.id === id);
    if (!selectedProduct) return;
    const p = selectedProduct, image = p.imageUrl || p.images?.[0] || '';
    $('productDetail').innerHTML = '<img class="detail-image" src="' + escapeHtml(image) + '" alt="' + escapeHtml(p.title) + '">' +
      '<span class="eyebrow">' + escapeHtml(p.category || 'Otros') + '</span><h2 id="detailTitle">' + escapeHtml(p.title) +
      '</h2><p>' + escapeHtml(p.description || 'Sin descripción') + '</p><strong class="detail-price">' + COP.format(Number(p.price) || 0) +
      '</strong><p>Publicado por ' + escapeHtml(p.sellerName || 'Usuario') + '</p>';
    $('detailBuyBtn').disabled = p.status !== 'available' || (state.user && p.sellerId === state.user.uid);
    $('detailBuyBtn').textContent = p.status === 'available' ? 'Comprar ahora' : 'Producto no disponible';
    $('productDialog').showModal();
  }
  function openCheckout() {
    if (!state.token) return showAuth('login');
    if (!selectedProduct || selectedProduct.sellerId === state.user.uid) return toast('No puedes comprar tu propio producto.');
    $('checkoutSummary').textContent = selectedProduct.title + ' · ' + COP.format(Number(selectedProduct.price) || 0);
    $('checkoutMessage').textContent = '';
    $('productDialog').close();
    $('checkoutDialog').showModal();
  }
  async function submitCheckout(event) {
    event.preventDefault();
    if (!selectedProduct || !$('checkoutForm').reportValidity()) return;
    const button = $('confirmOrderBtn'); button.disabled = true;
    $('checkoutMessage').textContent = 'Registrando pedido demostrativo…';
    try {
      const result = await api('/api/orders', { method: 'POST', body: JSON.stringify({
        productId: selectedProduct.id, deliveryAddress: $('deliveryAddress').value.trim(), paymentMethod: 'demo'
      }) });
      $('checkoutDialog').close(); $('checkoutForm').reset();
      toast(result.mensaje); await loadProducts(); await loadOrders();
    } catch (error) { $('checkoutMessage').textContent = error.message; }
    finally { button.disabled = false; }
  }
  async function submitAuth(e) {
    e.preventDefault();

    const reg = !$('nameField').classList.contains('hidden');
    const b = $('authSubmit');
    const email = $('authEmail').value.trim().toLowerCase();
    const password = $('authPassword').value;
    const confirmation = $('authConfirmPassword').value;
    const name = reg ? $('authName').value.trim() : '';
    const phone = reg ? $('authPhone').value.trim() : '';

    const showError = text => message('authMessage', text, true);

    if (!validateEmail()) {
      showError('Ingresa un correo electrónico válido.');
      $('authEmail').focus();
      return;
    }

    if (!validatePassword()) {
      showError('La contraseña debe tener mínimo 8 caracteres, mayúscula, minúscula y número.');
      $('authPassword').focus();
      return;
    }

    if (reg && name.length < 2) {
      showError('El nombre debe tener al menos 2 caracteres.');
      $('authName').focus();
      return;
    }

    if (reg && (phone.replace(/\D/g, '').length < 7 || phone.length > 20 || /[^\d+\s()-]/.test(phone))) {
      showError('Ingresa un teléfono válido de 7 a 20 dígitos y símbolos habituales.');
      $('authPhone').focus();
      return;
    }

    if (reg && (!confirmation || confirmation !== password || !validateConfirmation())) {
      showError('Las contraseñas deben coincidir.'); $('authConfirmPassword').focus(); return;
    }

    const body = { email, password };
    if (reg) Object.assign(body, { name, phone });

    b.disabled = true;

    try {
      let d, session;
      if (reg) {
        await getFirebaseApiKey();
        d = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
        try {
          session = await firebaseAuth('signInWithCustomToken', {
            token: d.customToken, returnSecureToken: true
          });
        } catch (error) {
          throw Error(`La cuenta se creó, pero no se pudo iniciar la sesión. Intenta iniciar sesión con el mismo correo y contraseña. ${error.message}`);
        }
      } else {
        session = await firebaseAuth('signInWithPassword', {
          email, password, returnSecureToken: true
        });
        const profile = await api('/api/users/me', {}, session.idToken);
        d = { user: profile.user };
      }

      state.token = session.idToken;
      state.user = d.user;
      sessionStorage.setItem('vendeyaToken', state.token);
      sessionStorage.setItem('vendeyaUser', JSON.stringify(state.user));

      setAuthUI();
      $('authForm').reset();
      message(
        'authMessage',
        reg ? 'Cuenta creada e inicio de sesión exitoso.' :
          'Sesión iniciada correctamente.'
      );
      toast(`Bienvenido ${state.user.name || state.user.email}`);

      await loadProducts();
      await loadOrders();
      await loadSellerDashboard();
      $('catalogo').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      showError(err.message || 'No se pudo completar la solicitud.');
    } finally {
      b.disabled = false;
    }
  }

  function logout(show = true) {
    state.token = ''; state.user = null;
    sessionStorage.removeItem('vendeyaToken'); sessionStorage.removeItem('vendeyaUser');
    setAuthUI(); loadProducts();
    if (show) toast('Sesión cerrada.');
  }
  function validProduct() {
    return $('productTitle').value.trim().length >= 3 &&
      $('productDescription').value.trim().length >= 5 &&
      Boolean($('productCategory').value) &&
      Number.isInteger(Number($('productPrice').value)) &&
      Number($('productPrice').value) > 0 &&
      images.length > 0 && images.length <= MAX_IMAGES &&
      images.every(f => TYPES.includes(f.type) && f.size <= MAX_SIZE);
  }
  function updateButton() {
    const b = $('productForm').querySelector('[type="submit"]');
    if (b) {
      b.disabled = !(state.token && state.user && validProduct());
      b.innerHTML = state.token ? 'Publicar producto <span>↗</span>' : 'Inicia sesión para publicar';
    }
  }
  function renderPreview() {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    const box = $('imagePreview'); box.replaceChildren();
    images.forEach((file, i) => {
      const item = document.createElement('div'); item.className = 'image-preview-item';
      const img = document.createElement('img'); img.alt = `Vista previa ${i + 1}`;
      img.src = URL.createObjectURL(file); previewUrls.push(img.src);
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Quitar';
      btn.addEventListener('click', () => {
        images.splice(i, 1); renderPreview(); updateButton();
      });
      item.append(img, btn); box.append(item);
    });
  }
  function selectImages(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > MAX_IMAGES || files.some(f => !TYPES.includes(f.type) || f.size > MAX_SIZE)) {
      message('productFormMessage', 'Selecciona hasta 5 imágenes JPG, PNG o WebP de máximo 5 MB cada una.', true);
      e.target.value = ''; return;
    }
    images = files; message('productFormMessage', '');
    renderPreview(); updateButton();
  }
  async function submitProduct(e) {
    e.preventDefault();
    if (!state.token || !state.user) return showAuth('login');
    if (!validProduct()) return message('productFormMessage', 'Completa los campos y selecciona al menos una imagen válida.', true);
    const b = $('productForm').querySelector('[type="submit"]');
    b.disabled = true; message('productFormMessage', 'Publicando producto e imágenes…');
    try {
      const fd = new FormData();
      ['productTitle','productDescription','productCategory','productPrice'].forEach((id,i) =>
        fd.append(['title','description','category','price'][i], $(id).value.trim()));
      images.forEach(f => fd.append('images', f));
      await api('/api/products', { method:'POST', body:fd });
      $('productForm').reset(); images = []; renderPreview();
      message('productFormMessage', 'Producto publicado correctamente.');
      toast('Producto publicado.');
      await Promise.all([loadProducts(), loadSellerDashboard()]);
      $('catalogo').scrollIntoView({ behavior:'smooth' });
    } catch (e) { message('productFormMessage', e.message, true); }
    finally { updateButton(); }
  }
  async function deleteProduct(id) {
    if (!confirm('¿Retirar este producto?')) return;
    try {
      const d = await api('/api/products/' + encodeURIComponent(id), { method:'DELETE' });
      toast(d.mensaje); await loadProducts();
    } catch (e) { toast(e.message); }
  }
  async function loadOrders() {
    if (!state.token) return;
    try {
      const orders = (await api('/api/orders')).orders || [];
      $('ordersList').innerHTML = orders.length ? orders.map(o =>
        `<article class="order-row"><div><strong>${escapeHtml(o.productTitle || 'Compra')}</strong>
        <p>${date(o.createdAt)} · ${COP.format(Number(o.price) || 0)} · ${o.sellerId === state.user.uid ? 'Venta' : 'Compra'}</p></div>
        <span class="order-status">${o.paymentStatus === 'paid' ? 'Pagada' : 'Sin pago · demo'}</span></article>`
      ).join('') : '<div class="empty-state">Todavía no tienes compras o ventas.</div>';
    } catch (e) { $('ordersList').textContent = e.message; }
  }
  $('showLoginBtn').addEventListener('click', () => showAuth('login'));
  $('showRegisterBtn').addEventListener('click', () => showAuth('register'));
  $('loginTab').addEventListener('click', () => setAuthMode('login'));
  $('registerTab').addEventListener('click', () => setAuthMode('register'));
  $('authForm').addEventListener('submit', submitAuth);
  $('authEmail').addEventListener('input', validateEmail);
  $('authPassword').addEventListener('input', validatePassword);
  $('authConfirmPassword').addEventListener('input', validateConfirmation);
  $('checkoutForm').addEventListener('submit', submitCheckout);
  $('detailBuyBtn').addEventListener('click', openCheckout);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('logoutBtn').addEventListener('click', () => logout());
  $('productForm').addEventListener('submit', submitProduct);
  $('productImages').addEventListener('change', selectImages);
  ['productTitle','productDescription','productCategory','productPrice'].forEach(id =>
    ['input','change'].forEach(ev => $(id).addEventListener(ev, updateButton)));
  $('topSearchForm').addEventListener('submit', e => { e.preventDefault(); $('searchInput').value = $('topSearchInput').value.trim(); state.page = 1; $('catalogo').scrollIntoView({ behavior: 'smooth' }); loadProducts(); });
  $('searchForm').addEventListener('submit', e => { e.preventDefault(); $('topSearchInput').value = $('searchInput').value; state.page = 1; loadProducts(); });
  $('prevPage').addEventListener('click', () => { if (state.page > 1) { state.page--; loadProducts(); } });
  $('nextPage').addEventListener('click', () => { if (state.page < state.pages) { state.page++; loadProducts(); } });
  $('refreshOrdersBtn').addEventListener('click', loadOrders);
  $('refreshDashboardBtn').addEventListener('click', loadSellerDashboard);
  $('myListingsLink').addEventListener('click', () => $('sellerDashboard').scrollIntoView({ behavior:'smooth' }));
  $('mySalesLink').addEventListener('click', () => $('ordersSection').scrollIntoView({ behavior:'smooth' }));
  $('productGrid').addEventListener('click', e => {
    const detail = e.target.closest('[data-detail]'), del = e.target.closest('[data-delete]');
    if (detail) showProduct(detail.dataset.detail);
    if (del) deleteProduct(del.dataset.delete);
  });


  let dashboardProducts = [];
  async function loadSellerDashboard() {
    if (!state.token) return;
    const list = $('sellerProductsList');
    list.innerHTML = '<div class="empty-state">Cargando publicaciones…</div>';
    try {
      const data = await api('/api/seller/dashboard');
      const stats = data.stats || {};
      $('statPublished').textContent = stats.published ?? 0;
      $('statActive').textContent = stats.active ?? 0;
      $('statSold').textContent = stats.sold ?? 0;
      $('statSales').textContent = stats.sales ?? 0;
      dashboardProducts = data.products || [];
      list.innerHTML = dashboardProducts.length ? dashboardProducts.map(product => `
        <article class="seller-product-card">
          <div class="seller-product-image"><img src="${escapeHtml(product.imageUrl || product.images?.[0] || '')}" alt="${escapeHtml(product.title)}" onerror="this.remove()"></div>
          <div class="seller-product-info"><span class="status-pill ${product.status === 'sold' ? 'is-sold' : ''}">${product.status === 'sold' ? 'Vendido' : 'Activo'}</span>
            <h4>${escapeHtml(product.title)}</h4><strong>${COP.format(Number(product.price) || 0)}</strong></div>
          <div class="seller-product-actions"><button type="button" class="btn btn-outline" data-edit="${escapeHtml(product.id)}" ${product.status === 'sold' ? 'disabled' : ''}>Editar producto</button>
            <button type="button" class="btn btn-ghost" data-delete="${escapeHtml(product.id)}">Retirar</button></div>
        </article>`).join('') : '<div class="empty-state">Todavía no tienes publicaciones.</div>';
    } catch (error) { list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
  }
  function openProductEdit(id) {
    const product = dashboardProducts.find(item => item.id === id);
    if (!product) return;
    $('editProductId').value = id;
    $('editProductName').value = product.title || '';
    $('editProductDescription').value = product.description || '';
    $('editProductCategory').replaceChildren(...state.categories.map(category => new Option(category, category)));
    $('editProductCategory').value = product.category || '';
    $('editProductPrice').value = product.price || '';
    message('editProductMessage', '');
    $('editProductDialog').showModal();
  }
  async function saveProductEdit(event) {
    event.preventDefault();
    if (!$('editProductForm').reportValidity()) return;
    const button = $('saveProductChangesBtn'); button.disabled = true;
    try {
      await api('/api/products/' + encodeURIComponent($('editProductId').value), {
        method: 'PUT', body: JSON.stringify({
          title: $('editProductName').value.trim(),
          description: $('editProductDescription').value.trim(),
          category: $('editProductCategory').value,
          price: Number($('editProductPrice').value)
        })
      });
      $('editProductDialog').close();
      toast('Publicación actualizada.');
      await Promise.all([loadProducts(), loadSellerDashboard()]);
    } catch (error) { message('editProductMessage', error.message, true); }
    finally { button.disabled = false; }
  }
  $('editProductForm').addEventListener('submit', saveProductEdit);
  $('sellerProductsList').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    if (edit) openProductEdit(edit.dataset.edit);
    if (remove) deleteProduct(remove.dataset.delete).then(() => loadSellerDashboard());
  });

  (async () => {
    setAuthUI(); setAuthMode('login'); await loadCategories(); updateButton(); await loadProducts();
    if (state.token && state.user) {
      try { await api('/api/users/me'); await Promise.all([loadOrders(), loadSellerDashboard()]); }
      catch { logout(false); }
    }
    try { if ((await api('/api/health')).estado !== 'ok') throw Error(); }
    catch { toast('La API no responde. Revisa el servidor.'); }
  })();
