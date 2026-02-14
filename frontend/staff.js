function resolveStaffApiBase() {
  const url = new URL(window.location.href);
  const apiBaseFromQuery = url.searchParams.get('apiBase');
  if (apiBaseFromQuery) return apiBaseFromQuery.replace(/\/+$/, '');
  const apiBaseFromStorage = localStorage.getItem('staffApiBase');
  if (apiBaseFromStorage) return apiBaseFromStorage.replace(/\/+$/, '');

  const { protocol, hostname, port, origin } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  if ((isLocalHost || isPrivateIp) && port && port !== '5000') {
    return `${protocol}//${hostname}:5000`;
  }
  return origin;
}

const STAFF_API_BASE = resolveStaffApiBase();
const STAFF_ROUTES = {
  login: '/staff/login',
  dashboard: '/staff/dashboard'
};
const STAFF_STATUS_ORDER = { Preparing: 0, Ready: 1, Delivered: 2 };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  return `\u20B9${Number(value || 0).toFixed(2)}`;
}

async function staffFetch(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
  } catch (_) {
    throw new Error(`Unable to reach API (${STAFF_API_BASE}). Ensure backend is running and reachable.`);
  }

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

function sortOrders(orders) {
  return [...orders].sort((a, b) => {
    const statusDelta = (STAFF_STATUS_ORDER[a.status] ?? 99) - (STAFF_STATUS_ORDER[b.status] ?? 99);
    if (statusDelta !== 0) return statusDelta;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

async function initStaffLoginPage() {
  const form = document.getElementById('staffLoginForm');
  const msg = document.getElementById('staffLoginMessage');
  const infoMessageEl = document.getElementById('staffInfoMessage');
  if (!form) return;

  const url = new URL(window.location.href);
  const infoMessage = url.searchParams.get('msg');
  if (infoMessageEl && infoMessage) {
    infoMessageEl.textContent = decodeURIComponent(infoMessage);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    msg.textContent = 'Signing in...';
    const email = document.getElementById('staffEmail')?.value?.trim();
    const password = document.getElementById('staffPassword')?.value || '';

    try {
      await staffFetch(`${STAFF_API_BASE}/api/staff/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      window.location.href = STAFF_ROUTES.dashboard;
    } catch (error) {
      msg.textContent = error.message;
    }
  });
}

async function initStaffSignupPage() {
  const form = document.getElementById('staffSignupForm');
  const msg = document.getElementById('staffSignupMessage');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    msg.textContent = 'Submitting request...';

    const name = document.getElementById('staffSignupName')?.value?.trim();
    const email = document.getElementById('staffSignupEmail')?.value?.trim();
    const canteenId = document.getElementById('staffSignupCanteenId')?.value?.trim().toUpperCase();
    const password = document.getElementById('staffSignupPassword')?.value || '';

    try {
      await staffFetch(`${STAFF_API_BASE}/api/staff/signup`, {
        method: 'POST',
        body: JSON.stringify({ name, email, password, canteenId })
      });
      const message = encodeURIComponent('Ask admin to accept staff request and then login with your email and password');
      window.location.href = `${STAFF_ROUTES.login}?msg=${message}`;
    } catch (error) {
      msg.textContent = error.message;
    }
  });
}

async function initStaffDashboardPage() {
  const ordersBoardEl = document.getElementById('staffOrdersBoard');
  const preparingEl = document.getElementById('staffOrdersPreparing');
  const readyEl = document.getElementById('staffOrdersReady');
  const deliveredEl = document.getElementById('staffOrdersDelivered');
  const scanResultEl = document.getElementById('staffScanResult');
  const ordersViewEl = document.getElementById('staffOrdersView');
  const scanViewEl = document.getElementById('staffScanView');
  const menuToggleEl = document.getElementById('staffMenuToggle');
  const menuPanelEl = document.getElementById('staffMenuPanel');
  const menuLinks = Array.from(document.querySelectorAll('[data-staff-route]'));
  const identityEl = document.getElementById('staffIdentity');
  const liveStatusEl = document.getElementById('staffLiveStatus');
  const scanStatusEl = document.getElementById('staffScanStatus');
  const refreshBtn = document.getElementById('staffRefreshBtn');
  const logoutBtn = document.getElementById('staffLogoutBtn');
  if (!ordersBoardEl || !preparingEl || !readyEl || !deliveredEl || !identityEl || !scanResultEl || !ordersViewEl || !scanViewEl) return;

  let staffSession = null;
  let ordersCache = [];
  let pollTimer = null;
  let scanner = null;
  let scanLock = false;
  let scannerStarting = false;
  let activeRoute = 'orders';

  function renderOrderCard(order) {
    const itemsText = (order.items || [])
      .map((item) => `${item.name || item.foodID?.name || 'Unknown'} x ${item.quantity}`)
      .join(', ');

    const statusClass = order.status === 'Ready'
      ? 'chip-ready'
      : order.status === 'Delivered'
        ? 'chip-delivered'
        : 'chip-preparing';

    return `
      <article class="order-card" data-order-id="${order._id}" data-order-code="${escapeHtml(order.orderID)}">
        <div class="order-head">
          <p class="order-id">${escapeHtml(order.orderID)}</p>
          <span class="order-chip ${statusClass}">${escapeHtml(order.status)}</span>
        </div>
        <p class="order-items">${escapeHtml(itemsText)}</p>
        <p class="order-total">Total: ${formatCurrency(order.total)}</p>
        <div class="order-controls">
          ${['Preparing', 'Ready', 'Delivered'].map((status) => `
            <button
              class="status-btn ${order.status === status ? 'is-current' : ''}"
              data-action="status"
              data-id="${order._id}"
              data-status="${status}"
              type="button"
            >${status}</button>
          `).join('')}
        </div>
      </article>
    `;
  }

  function renderSection(container, list, emptyText) {
    container.innerHTML = list.length
      ? list.map(renderOrderCard).join('')
      : `<article class="order-card"><p class="staff-muted">${emptyText}</p></article>`;
  }

  function renderOrders() {
    const orders = sortOrders(ordersCache);
    renderSection(preparingEl, orders.filter((order) => order.status === 'Preparing'), 'No preparing orders today.');
    renderSection(readyEl, orders.filter((order) => order.status === 'Ready'), 'No ready orders today.');
    renderSection(deliveredEl, orders.filter((order) => order.status === 'Delivered'), 'No delivered orders today.');
  }

  function renderScanResult(order, message = '') {
    if (!order) {
      scanResultEl.innerHTML = `<article class="order-card"><p class="staff-muted">${escapeHtml(message || 'No scan yet.')}</p></article>`;
      return;
    }

    const itemsText = (order.items || [])
      .map((item) => `${item.name || item.foodID?.name || 'Unknown'} x ${item.quantity}`)
      .join(', ');

    scanResultEl.innerHTML = `
      <article class="order-card">
        <div class="order-head">
          <p class="order-id">${escapeHtml(order.orderID || '-')}</p>
          <span class="order-chip chip-delivered">Delivered</span>
        </div>
        <p class="order-meta">Token: ${escapeHtml(order.dailyToken || '-')} | Date: ${escapeHtml(order.orderDate || '-')}</p>
        <p class="order-items">${escapeHtml(itemsText)}</p>
        <p class="order-total">Total: ${formatCurrency(order.total)}</p>
      </article>
    `;
    if (message) scanStatusEl.textContent = message;
  }

  function getCurrentRoute() {
    const hash = window.location.hash || '#/orders';
    return hash === '#/scan' ? 'scan' : 'orders';
  }

  async function stopScanner() {
    if (scanner && scanner.isScanning) {
      try {
        await scanner.stop();
      } catch (_) {
        // ignore scanner stop errors
      }
    }
    scanner = null;
    scannerStarting = false;
  }

  function pickPreferredBackCamera(cameras) {
    if (!Array.isArray(cameras) || cameras.length === 0) return null;

    const scoreCamera = (camera) => {
      const label = String(camera?.label || '').toLowerCase();
      let score = 0;
      if (label.includes('back') || label.includes('rear') || label.includes('environment')) score += 100;
      if (label.includes('main') || label.includes('standard') || label.includes('1x')) score += 30;
      if (label.includes('wide') || label.includes('ultra') || label.includes('0.6') || label.includes('0.5')) score -= 40;
      if (label.includes('front') || label.includes('selfie') || label.includes('user')) score -= 80;
      return score;
    };

    return [...cameras].sort((a, b) => scoreCamera(b) - scoreCamera(a))[0] || null;
  }

  function isLocalHost() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  async function verifyScannedPayload(payload) {
    const orderId = String(payload?.orderId || '').trim();
    const token = String(payload?.token || '').trim();
    const canteenId = String(payload?.canteenId || '').trim();
    const date = String(payload?.date || '').trim();

    if (!orderId || !token || !canteenId || !date) {
      throw new Error('QR data is invalid.');
    }

    const response = await fetch(
      `${STAFF_API_BASE}/api/orders/verify?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}&canteenId=${encodeURIComponent(canteenId)}&date=${encodeURIComponent(date)}`,
      {
        method: 'GET',
        credentials: 'include'
      }
    );
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }

  async function handleScan(decodedText) {
    if (scanLock) return;
    scanLock = true;
    try {
      let payload;
      try {
        payload = JSON.parse(decodedText);
      } catch (_) {
        scanStatusEl.textContent = 'Invalid QR format.';
        renderScanResult(null, 'Invalid QR format.');
        return;
      }

      const result = await verifyScannedPayload(payload);
      if (result.ok) {
        renderScanResult(result.data.order, 'Order marked as Delivered.');
        await loadOrders();
        return;
      }

      if (result.status === 409 && result.data?.message === 'Order already delivered') {
        renderScanResult(result.data.order || null, 'Order already delivered');
        await loadOrders();
        return;
      }

      if (result.status === 404) {
        renderScanResult(null, 'Order not found for today');
        return;
      }

      renderScanResult(null, result.data?.message || 'Verification failed');
    } catch (error) {
      renderScanResult(null, error.message || 'Scan failed');
    } finally {
      setTimeout(() => {
        scanLock = false;
      }, 1000);
    }
  }

  async function startScanner() {
    if (scannerStarting || scanner?.isScanning) return;
    if (activeRoute !== 'scan') return;
    scannerStarting = true;

    if (!window.isSecureContext && !isLocalHost()) {
      scanStatusEl.textContent = 'Scanner error: camera access on mobile needs HTTPS (or localhost).';
      scannerStarting = false;
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      scanStatusEl.textContent = 'Scanner error: this browser does not support camera access.';
      scannerStarting = false;
      return;
    }
    if (!window.Html5Qrcode) {
      scanStatusEl.textContent = 'Scanner unavailable: library not loaded.';
      scannerStarting = false;
      return;
    }

    try {
      const candidates = [];
      if (typeof window.Html5Qrcode.getCameras === 'function') {
        try {
          const cameras = await window.Html5Qrcode.getCameras();
          const preferred = pickPreferredBackCamera(cameras);
          if (preferred?.id) candidates.push(preferred.id);
        } catch (_) {
          // keep fallbacks
        }
      }
      candidates.push({ facingMode: { ideal: 'environment' } });
      candidates.push({ facingMode: 'environment' });

      for (const candidate of candidates) {
        try {
          scanner = new window.Html5Qrcode('staffQrReader');
          await scanner.start(
            candidate,
            { fps: 10, qrbox: { width: 220, height: 220 } },
            async (decodedText) => {
              await handleScan(decodedText);
            }
          );
          scanStatusEl.textContent = 'Scanner ready. Scan pickup QR.';
          scannerStarting = false;
          return;
        } catch (_) {
          if (scanner && scanner.isScanning) {
            try {
              await scanner.stop();
            } catch (_) {
              // ignore
            }
          }
          scanner = null;
        }
      }

      scanStatusEl.textContent = 'Scanner error: unable to start camera.';
    } catch (error) {
      scanStatusEl.textContent = `Scanner error: ${error?.message || 'Unable to start camera.'}`;
    } finally {
      scannerStarting = false;
    }
  }

  async function setRoute(route) {
    activeRoute = route === 'scan' ? 'scan' : 'orders';
    ordersViewEl.style.display = activeRoute === 'orders' ? 'grid' : 'none';
    scanViewEl.style.display = activeRoute === 'scan' ? 'grid' : 'none';
    menuLinks.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.staffRoute === activeRoute);
    });
    menuPanelEl?.classList.remove('is-open');

    if (activeRoute === 'scan') {
      await startScanner();
    } else {
      await stopScanner();
    }
  }

  async function loadOrders() {
    if (!staffSession?.canteenId) return;
    const orders = await staffFetch(
      `${STAFF_API_BASE}/api/orders?canteenId=${encodeURIComponent(staffSession.canteenId)}`
    );
    ordersCache = Array.isArray(orders) ? orders : [];
    renderOrders();
    liveStatusEl.textContent = ordersCache.length ? 'Live updates connected.' : 'No orders for today yet.';
  }

  function upsertOrder(order) {
    const index = ordersCache.findIndex((entry) => entry._id === order._id);
    if (index === -1) ordersCache.unshift(order);
    else ordersCache[index] = order;
    renderOrders();
  }

  function setupSocket() {
    if (!window.io) {
      liveStatusEl.textContent = 'Live updates unavailable. Polling only.';
      return;
    }

    const socket = window.io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      liveStatusEl.textContent = 'Live updates connected.';
    });
    socket.on('disconnect', () => {
      liveStatusEl.textContent = 'Live connection lost. Polling fallback active.';
    });
    socket.on('newOrder', ({ order }) => {
      if (!order || order.canID !== staffSession?.canteenId) return;
      loadOrders().catch(() => {});
    });
    socket.on('orderUpdated', ({ order }) => {
      if (!order || order.canID !== staffSession?.canteenId) return;
      loadOrders().catch(() => {});
    });
  }

  try {
    const me = await staffFetch(`${STAFF_API_BASE}/api/staff/me`);
    staffSession = me.session;
    identityEl.textContent = `${staffSession.name} (${staffSession.email}) | Canteen: ${staffSession.canteenId}`;
  } catch (_) {
    window.location.href = STAFF_ROUTES.login;
    return;
  }

  renderScanResult(null, 'No scan yet.');
  await loadOrders();
  setupSocket();

  pollTimer = setInterval(() => {
    loadOrders().catch(() => {});
  }, 7000);

  ordersBoardEl.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="status"]');
    if (!button) return;

    const orderId = button.dataset.id;
    const status = button.dataset.status;
    try {
      const data = await staffFetch(`${STAFF_API_BASE}/api/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      upsertOrder(data.order);
    } catch (error) {
      liveStatusEl.textContent = error.message;
    }
  });

  menuToggleEl?.addEventListener('click', () => {
    menuPanelEl?.classList.toggle('is-open');
  });

  document.addEventListener('click', (event) => {
    if (!menuPanelEl || !menuToggleEl) return;
    if (!menuPanelEl.contains(event.target) && event.target !== menuToggleEl) {
      menuPanelEl.classList.remove('is-open');
    }
  });

  window.addEventListener('hashchange', async () => {
    await setRoute(getCurrentRoute());
  });

  refreshBtn?.addEventListener('click', () => {
    loadOrders().catch((error) => {
      liveStatusEl.textContent = error.message;
    });
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      await staffFetch(`${STAFF_API_BASE}/api/staff/logout`, { method: 'POST' });
    } finally {
      window.location.href = STAFF_ROUTES.login;
    }
  });

  if (!window.location.hash) {
    window.location.hash = '#/orders';
  }
  await setRoute(getCurrentRoute());

  window.addEventListener('beforeunload', async () => {
    if (pollTimer) clearInterval(pollTimer);
    await stopScanner();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('staffLoginForm')) initStaffLoginPage();
  if (document.getElementById('staffSignupForm')) initStaffSignupPage();
  if (document.getElementById('staffOrdersBoard')) initStaffDashboardPage();
});
