const API_BASE = window.location.origin;
function getStudentBasePath() {
  const pathname = window.location.pathname || '';
  return pathname.includes('/frontend/') ? '/frontend/student/' : '/student/';
}

function studentRoute(slug) {
  const base = getStudentBasePath();
  if (base.includes('/frontend/')) return `${base}${slug}.html`;
  return `${base}${slug}`;
}

const STUDENT_ROUTES = {
  login: studentRoute('login'),
  signup: studentRoute('signup'),
  home: studentRoute('home'),
  cart: studentRoute('cart'),
  payment: studentRoute('payment'),
  success: studentRoute('order-success'),
  orders: studentRoute('my-orders'),
  profile: studentRoute('profile')
};

const NOTIFY_ROOT_ID = 'appNotifyRoot';
const NOTIFY_STYLE_ID = 'appNotifyStyle';

function ensureNotifySystem() {
  if (!document.getElementById(NOTIFY_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = NOTIFY_STYLE_ID;
    style.textContent = `
      #${NOTIFY_ROOT_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 99999; }
      #${NOTIFY_ROOT_ID} .notify-snack-wrap { position: fixed; top: 18px; right: 18px; display: flex; flex-direction: column; gap: 10px; width: min(430px, calc(100vw - 24px)); }
      #${NOTIFY_ROOT_ID} .notify-snack { border-radius: 12px; color: #fff; padding: 12px 14px; font-size: 14px; line-height: 1.35; box-shadow: 0 12px 28px rgba(0,0,0,.26); transform: translateY(-8px); opacity: 0; animation: snackIn .16s ease forwards; pointer-events: auto; }
      #${NOTIFY_ROOT_ID} .notify-snack.success { background: linear-gradient(135deg, #15803d, #22c55e); }
      #${NOTIFY_ROOT_ID} .notify-snack.error { background: linear-gradient(135deg, #b91c1c, #ef4444); }
      #${NOTIFY_ROOT_ID} .notify-modal { position: fixed; inset: 0; background: rgba(2, 6, 23, .44); display: flex; align-items: center; justify-content: center; padding: 16px; pointer-events: auto; }
      #${NOTIFY_ROOT_ID} .notify-panel { width: min(450px, 100%); background: #fff; border-radius: 16px; border-top: 5px solid #0f172a; box-shadow: 0 22px 50px rgba(0,0,0,.26); padding: 18px; animation: modalIn .18s ease; color: #0f172a; }
      #${NOTIFY_ROOT_ID} .notify-panel h3 { margin: 0 0 8px; font-size: 18px; }
      #${NOTIFY_ROOT_ID} .notify-panel p { margin: 0; font-size: 14px; line-height: 1.45; }
      #${NOTIFY_ROOT_ID} .notify-panel .actions { margin-top: 16px; display: flex; justify-content: flex-end; }
      #${NOTIFY_ROOT_ID} .notify-panel button { border: 0; border-radius: 10px; padding: 9px 14px; color: #fff; background: #0f172a; font-weight: 600; cursor: pointer; }
      #${NOTIFY_ROOT_ID} .notify-panel.error { border-top-color: #b91c1c; }
      #${NOTIFY_ROOT_ID} .notify-panel.error button { background: #b91c1c; }
      #${NOTIFY_ROOT_ID} .notify-panel.success { border-top-color: #15803d; }
      #${NOTIFY_ROOT_ID} .notify-panel.success button { background: #15803d; }
      @keyframes snackIn { to { transform: translateY(0); opacity: 1; } }
      @keyframes snackOut { to { transform: translateY(-8px); opacity: 0; } }
      @keyframes modalIn { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @media (max-width: 640px) {
        #${NOTIFY_ROOT_ID} .notify-snack-wrap { left: 12px; right: 12px; top: auto; bottom: 12px; width: auto; }
      }
    `;
    document.head.appendChild(style);
  }

  let root = document.getElementById(NOTIFY_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = NOTIFY_ROOT_ID;
    document.body.appendChild(root);
  }
  let snackWrap = root.querySelector('.notify-snack-wrap');
  if (!snackWrap) {
    snackWrap = document.createElement('div');
    snackWrap.className = 'notify-snack-wrap';
    root.appendChild(snackWrap);
  }
  return { root, snackWrap };
}

function showSnack(message, type = 'success') {
  const { snackWrap } = ensureNotifySystem();
  const node = document.createElement('div');
  node.className = `notify-snack ${type === 'error' ? 'error' : 'success'}`;
  node.textContent = String(message || '');
  snackWrap.appendChild(node);
  setTimeout(() => {
    node.style.animation = 'snackOut .18s ease forwards';
    setTimeout(() => node.remove(), 190);
  }, 2300);
}

function showPopupAlert(message, type = 'info', title = '') {
  const { root } = ensureNotifySystem();
  const modal = document.createElement('div');
  modal.className = 'notify-modal';
  const panel = document.createElement('div');
  panel.className = `notify-panel ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  panel.innerHTML = `
    <h3>${escapeHtml(title || (type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Message'))}</h3>
    <p>${escapeHtml(String(message || ''))}</p>
    <div class="actions"><button type="button">OK</button></div>
  `;
  modal.appendChild(panel);
  root.appendChild(modal);

  const close = () => modal.remove();
  panel.querySelector('button')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
}

function getCanID() {
  return localStorage.getItem('canID') || '';
}

function setCanID(canID) {
  localStorage.setItem('canID', canID);
}

function clearCanID() {
  localStorage.removeItem('canID');
}

function getAdminEmail() {
  return localStorage.getItem('adminEmail') || '';
}

function setAdminEmail(email) {
  localStorage.setItem('adminEmail', email);
}

function clearAdminEmail() {
  localStorage.removeItem('adminEmail');
}

function getStudentSession() {
  try {
    return JSON.parse(localStorage.getItem('studentSession') || 'null');
  } catch (_) {
    return null;
  }
}

function setStudentSession(session) {
  localStorage.setItem('studentSession', JSON.stringify(session));
}

function clearStudentSession() {
  localStorage.removeItem('studentSession');
}

function requireCanID() {
  const canID = getCanID();
  if (!canID) {
    alert('Please login first');
    window.location.href = 'admin-login.html';
    return null;
  }
  return canID;
}

function requireStudentSession() {
  const session = getStudentSession();
  if (!session?.studentID || !session?.canID) {
    alert('Please login as student first');
    window.location.href = STUDENT_ROUTES.login;
    return null;
  }
  return session;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatCurrency(value) {
  return `\u20B9${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return raw;
}

function isValidEmail(email) {
  const value = String(email || '').trim();
  if (!value || value.length > 254 || value.includes('..')) return false;

  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  if (!localPart || !domain || localPart.length > 64) return false;
  if (!/^[A-Za-z0-9._%+-]+$/.test(localPart)) return false;
  if (!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain)) return false;

  const labels = domain.split('.');
  return labels.every((label) => label && !label.startsWith('-') && !label.endsWith('-'));
}

function isValidPassword(password) {
  return String(password || '').length >= 8;
}

function normalizeMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function isValidMobile(value) {
  return /^\d{10}$/.test(normalizeMobile(value));
}

function validateAuthPayload(payload, requireCanID = false) {
  if (requireCanID && !payload.canID) {
    return 'canID is required';
  }
  if (!isValidEmail(payload.email)) {
    return 'Please enter a valid email address';
  }
  if (!isValidPassword(payload.password)) {
    return 'Password must be at least 8 characters';
  }
  return '';
}

function validateStudentSignupPayload(payload) {
  if (!payload.canID) return 'canID is required';
  if (!payload.name) return 'Name is required';
  if (!payload.classSemester) return 'Class & semester is required';
  if (!isValidMobile(payload.mobile)) return 'Please enter a valid 10-digit mobile number';
  if (!isValidEmail(payload.email)) return 'Please enter a valid email address';
  if (!payload.admissionNumber) return 'Admission number is required';
  if (!isValidPassword(payload.password)) return 'Password must be at least 8 characters';
  return '';
}

function resolveFoodImage(food) {
  const imageUrl = normalizeImageUrl(food?.imageUrl);
  if (imageUrl) return imageUrl;
  return `https://picsum.photos/seed/${encodeURIComponent(food?.name || 'food')}/640/420`;
}

function normalizeFoodCategory(value) {
  const category = String(value || '').toLowerCase();
  if (category === 'drink' || category === 'drinks') return 'drink';
  if (category === 'snack' || category === 'snacks') return 'snack';
  return 'food';
}

function getStudentCart() {
  const session = getStudentSession();
  if (!session?.studentID) return [];
  try {
    return JSON.parse(localStorage.getItem(`studentCart:${session.studentID}`) || '[]');
  } catch (_) {
    return [];
  }
}

function setStudentCart(items) {
  const session = getStudentSession();
  if (!session?.studentID) return;
  localStorage.setItem(`studentCart:${session.studentID}`, JSON.stringify(items));
}

function clearStudentCart() {
  const session = getStudentSession();
  if (!session?.studentID) return;
  localStorage.removeItem(`studentCart:${session.studentID}`);
}

function getStatusClass(status) {
  if (status === 'Ready') return 'status-ready';
  if (status === 'Delivered') return 'status-delivered';
  return 'status-preparing';
}

function applyAdminHeaderIdentity(canID) {
  setText('canIDValue', canID);
  const email = getAdminEmail();
  if (email) setText('adminEmailValue', email);
}

function initAuthPageTransitions() {
  const page = document.body?.dataset?.page;
  if (page !== 'login' && page !== 'signup') return;

  document.querySelectorAll('a[data-auth-switch]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href) return;
      e.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(() => {
        window.location.href = href;
      }, 210);
    });
  });
}

async function safeFetch(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    const fallbackMessage = raw && !raw.startsWith('<!DOCTYPE html') ? raw : `Request failed (${response.status})`;
    throw new Error(data.message || fallbackMessage);
  }
  return data;
}

function closeOrderQrModal() {
  const modal = document.getElementById('orderQrModal');
  if (modal) modal.style.display = 'none';
}

async function openOrderQrModal(order) {
  const modal = document.getElementById('orderQrModal');
  const meta = document.getElementById('orderQrMeta');
  const qrCanvas = document.getElementById('orderQrCanvas');
  const fallback = document.getElementById('orderQrFallback');
  if (!modal || !meta || !qrCanvas || !fallback) return;

  meta.textContent = `Order: ${order.orderID} | Status: ${order.status}`;
  fallback.style.display = 'none';
  fallback.textContent = '';
  qrCanvas.innerHTML = '';

  if (!order.qrToken) {
    fallback.style.display = 'block';
    fallback.textContent = 'QR token not available for this order yet.';
  } else if (window.QRCode?.toCanvas) {
    const canvas = document.createElement('canvas');
    qrCanvas.appendChild(canvas);
    try {
      await window.QRCode.toCanvas(canvas, order.qrToken, {
        width: 200,
        margin: 2,
        errorCorrectionLevel: 'L',
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (_) {
      fallback.style.display = 'block';
      fallback.textContent = 'Unable to generate QR. Please try again.';
    }
  } else if (typeof window.QRCode === 'function') {
    try {
      new window.QRCode(qrCanvas, {
        text: order.qrToken,
        width: 200,
        height: 200,
        correctLevel: window.QRCode.CorrectLevel.L,
        colorDark: '#000000',
        colorLight: '#ffffff'
      });
    } catch (_) {
      fallback.style.display = 'block';
      fallback.textContent = 'Unable to generate QR. Please try again.';
    }
  } else {
    fallback.style.display = 'block';
    fallback.textContent = 'QR library not loaded.';
  }

  modal.style.display = 'flex';
}

async function initSignupPage() {
  const form = document.getElementById('signupForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      collegeName: document.getElementById('collegeName').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value
    };
    const validationError = validateAuthPayload(payload);
    if (validationError) {
      showSnack(validationError, 'error');
      return;
    }

    try {
      const data = await safeFetch(`${API_BASE}/admin/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setCanID(data.canID);
      setAdminEmail(payload.email);
      showSnack(`Signup successful. Your canID: ${data.canID}`, 'success');
      window.location.href = 'dashboard.html';
    } catch (error) {
      showSnack(error.message, 'error');
    }
  });
}

async function initLoginPage() {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value
    };
    const validationError = validateAuthPayload(payload);
    if (validationError) {
      showSnack(validationError, 'error');
      return;
    }

    try {
      const data = await safeFetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setCanID(data.canID);
      setAdminEmail(payload.email);
      showSnack(`Login successful. canID: ${data.canID}`, 'success');
      window.location.href = 'dashboard.html';
    } catch (error) {
      showSnack(error.message, 'error');
    }
  });
}

async function initDashboardPage() {
  const canID = requireCanID();
  if (!canID) return;

  applyAdminHeaderIdentity(canID);

  try {
    const data = await safeFetch(`${API_BASE}/admin/dashboard/${canID}`);
    const foodCount = data.stats.foodCount || 0;
    const orderCount = data.stats.orderCount || 0;
    const studentCount = data.stats.studentCount || 0;

    setText('statMenuItems', foodCount);
    setText('statOrders', orderCount);
    setText('statStudents', studentCount);

    const ul = document.getElementById('statsList');
    if (ul) {
      ul.innerHTML = '';
      [
        ['Total Foods', foodCount],
        ['Total Orders', orderCount],
        ['Total Students', studentCount]
      ].forEach(([k, v]) => {
        const li = document.createElement('li');
        li.textContent = `${k}: ${v}`;
        ul.appendChild(li);
      });
    }
  } catch (error) {
    alert(error.message);
  }

  try {
    const orders = await safeFetch(`${API_BASE}/orders/${canID}`);
    const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    setText('statRevenue', formatCurrency(revenue));

    const tbody = document.getElementById('dashboardRecentOrdersBody');
    if (!tbody) return;

    const recent = orders.slice(0, 5);
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><p class="empty-hint">No recent orders found.</p></td></tr>';
      return;
    }

    tbody.innerHTML = recent.map((order) => {
      const itemsText = order.items
        .map((item) => `${item.foodID?.name || 'Unknown'} x ${item.quantity}`)
        .join(', ');
      return `
        <tr>
          <td>${order.orderID}</td>
          <td>${order.studentID?.name || 'Unknown'}</td>
          <td>${itemsText}</td>
          <td>${formatCurrency(order.total)}</td>
          <td><span class="status-badge ${getStatusClass(order.status)}">${order.status}</span></td>
        </tr>
      `;
    }).join('');
  } catch (_) {
    setText('statRevenue', formatCurrency(0));
  }
}

function renderFoodsTable(foods) {
  const tbody = document.getElementById('foodTableBody');
  tbody.innerHTML = '';

  foods.forEach((food) => {
    const tr = document.createElement('tr');
    const category = normalizeFoodCategory(food.category);
    const imageUrl = normalizeImageUrl(food.imageUrl);
    const name = escapeHtml(food.name);

    tr.innerHTML = `
      <td>${name}</td>
      <td>
        <select data-category-id="${food._id}">
          <option value="food" ${category === 'food' ? 'selected' : ''}>Food</option>
          <option value="drink" ${category === 'drink' ? 'selected' : ''}>Drink</option>
          <option value="snack" ${category === 'snack' ? 'selected' : ''}>Snack</option>
        </select>
      </td>
      <td>
        <input type="url" value="${escapeHtml(imageUrl)}" placeholder="https://example.com/image.jpg" data-image-id="${food._id}" />
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${food.price}" data-price-id="${food._id}" />
      </td>
      <td><span class="status-badge ${food.inStock ? 'status-ready' : 'status-preparing'}">${food.inStock ? 'In Stock' : 'Out of Stock'}</span></td>
      <td>
        <div class="btn-group">
          <button class="btn btn-secondary btn-small" data-action="save" data-id="${food._id}" data-stock="${food.inStock}">Save</button>
          <button class="btn btn-primary btn-small" data-action="toggle" data-id="${food._id}" data-stock="${food.inStock}">
            ${food.inStock ? 'Stock Out' : 'Stock In'}
          </button>
          <button class="btn btn-danger btn-small" data-action="delete" data-id="${food._id}">Delete</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function initMenuPage() {
  const canID = requireCanID();
  if (!canID) return;

  applyAdminHeaderIdentity(canID);

  async function loadFoods() {
    try {
      const foods = await safeFetch(`${API_BASE}/foods/${canID}`);
      renderFoodsTable(foods);
    } catch (error) {
      alert(error.message);
    }
  }

  document.getElementById('addFoodForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      canID,
      name: document.getElementById('foodName').value.trim(),
      category: document.getElementById('foodCategory').value,
      imageUrl: normalizeImageUrl(document.getElementById('foodImageUrl').value),
      price: Number(document.getElementById('foodPrice').value),
      inStock: document.getElementById('foodStock').checked
    };

    try {
      await safeFetch(`${API_BASE}/food/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Food added');
      e.target.reset();
      loadFoods();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById('foodTableBody').addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    const foodID = button.dataset.id;

    try {
      if (action === 'delete') {
        await safeFetch(`${API_BASE}/food/${foodID}`, { method: 'DELETE' });
        alert('Food deleted');
      }

      if (action === 'toggle') {
        const currentStock = button.dataset.stock === 'true';
        await safeFetch(`${API_BASE}/food/${foodID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inStock: !currentStock })
        });
        alert('Stock updated');
      }

      if (action === 'save') {
        const priceInput = document.querySelector(`input[data-price-id="${foodID}"]`);
        const categoryInput = document.querySelector(`select[data-category-id="${foodID}"]`);
        const imageInput = document.querySelector(`input[data-image-id="${foodID}"]`);
        const price = Number(priceInput.value);
        await safeFetch(`${API_BASE}/food/${foodID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            price,
            category: categoryInput?.value || 'food',
            imageUrl: normalizeImageUrl(imageInput?.value)
          })
        });
        alert('Food updated');
      }

      loadFoods();
    } catch (error) {
      alert(error.message);
    }
  });

  loadFoods();
}

function renderStudents(students) {
  const tbody = document.getElementById('studentsBody');
  tbody.innerHTML = '';

  students.forEach((student) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    const statusBadge = student.banned 
      ? '<span class="status-badge status-banned">Banned</span>'
      : '<span class="status-badge status-active">Active</span>';
    tr.innerHTML = `
      <td>${student.name}</td>
      <td>${student.email}</td>
      <td>${student.mobile}</td>
      <td>${student.classSemester}</td>
      <td>${student.admissionNumber}</td>
      <td>${statusBadge}</td>
      <td><button class="btn ${student.banned ? 'btn-success' : 'btn-danger'} btn-small" data-id="${student._id}" onclick="event.stopPropagation()">${student.banned ? 'Unban' : 'Ban'}</button></td>
    `;
    tr.addEventListener('click', () => showStudentDetails(student));
    tbody.appendChild(tr);
  });
}

function showStudentDetails(student) {
  const modal = document.getElementById('studentModal');
  document.getElementById('modalName').textContent = student.name;
  document.getElementById('modalEmail').textContent = student.email;
  document.getElementById('modalMobile').textContent = student.mobile;
  document.getElementById('modalClassSemester').textContent = student.classSemester;
  document.getElementById('modalAdmissionNumber').textContent = student.admissionNumber;
  document.getElementById('modalCanID').textContent = student.canID;
  document.getElementById('modalStudentID').textContent = student._id;
  document.getElementById('modalJoined').textContent = new Date(student.createdAt).toLocaleDateString();
  document.getElementById('modalStatus').textContent = student.banned ? 'Banned' : 'Active';
  
  const banBtn = document.getElementById('banStudentBtn');
  if (student.banned) {
    banBtn.textContent = 'Unban Student';
    banBtn.classList.remove('btn-danger');
    banBtn.classList.add('btn-success');
  } else {
    banBtn.textContent = 'Ban Student';
    banBtn.classList.remove('btn-success');
    banBtn.classList.add('btn-danger');
  }
  
  modal.dataset.studentId = student._id;
  modal.style.display = 'flex';
}

async function initStudentsPage() {
  const canID = requireCanID();
  if (!canID) return;

  applyAdminHeaderIdentity(canID);

  const modal = document.getElementById('studentModal');
  const closeModal = document.getElementById('closeModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const banStudentBtn = document.getElementById('banStudentBtn');

  async function loadStudents() {
    try {
      const students = await safeFetch(`${API_BASE}/students/${canID}`);
      renderStudents(students);
    } catch (error) {
      alert(error.message);
    }
  }

  // Close modal
  closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  closeModalBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Ban/Unban student
  banStudentBtn.addEventListener('click', async () => {
    const studentId = modal.dataset.studentId;
    if (!studentId) return;

    const action = banStudentBtn.textContent.includes('Ban') ? 'ban' : 'unban';
    if (!confirm(`Are you sure you want to ${action} this student?`)) return;

    try {
      const response = await safeFetch(`${API_BASE}/student/${studentId}/ban`, { 
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      alert(response.message);
      modal.style.display = 'none';
      loadStudents();
    } catch (error) {
      alert(error.message);
    }
  });

  loadStudents();
}

function renderStaffs(staffs) {
  const tbody = document.getElementById('staffsBody');
  if (!tbody) return;
  if (!staffs.length) {
    tbody.innerHTML = '<tr><td colspan="5"><p class="empty-hint">No staff requests found.</p></td></tr>';
    return;
  }

  tbody.innerHTML = staffs.map((staff) => {
    const normalizedStatus = staff.status || 'Pending';
    const statusClass = normalizedStatus === 'Approved'
      ? 'status-ready'
      : normalizedStatus === 'Declined'
        ? 'status-preparing'
        : 'status-pending';

    const pendingActions = normalizedStatus === 'Pending'
      ? `
        <button class="btn btn-success btn-small" data-action="accept" data-id="${staff._id}">Accept</button>
        <button class="btn btn-danger btn-small" data-action="decline" data-id="${staff._id}">Decline</button>
      `
      : '<span class="empty-hint">No pending action</span>';

    return `
      <tr>
        <td>${escapeHtml(staff.name || '')}</td>
        <td>${escapeHtml(staff.email || '')}</td>
        <td>${escapeHtml(staff.canteenId || '')}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(normalizedStatus)}</span></td>
        <td><div class="btn-group">${pendingActions}</div></td>
      </tr>
    `;
  }).join('');
}

async function initStaffsPage() {
  const canID = requireCanID();
  if (!canID) return;
  applyAdminHeaderIdentity(canID);
  const tbody = document.getElementById('staffsBody');

  async function loadStaffs() {
    try {
      const staffs = await safeFetch(`${API_BASE}/admin/staffs/${canID}`);
      renderStaffs(staffs);
    } catch (error) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5"><p class="empty-hint">${escapeHtml(error.message)}</p></td></tr>`;
      }
    }
  }

  tbody?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const staffId = button.dataset.id;
    if (!staffId) return;

    try {
      await safeFetch(`${API_BASE}/admin/staff/${staffId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, canID })
      });
      loadStaffs();
    } catch (error) {
      alert(error.message);
    }
  });

  loadStaffs();
}

function renderOrders(orders) {
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = '';

  const groups = orders.reduce((acc, order) => {
    const date = new Date(order.createdAt);
    const key = Number.isNaN(date.getTime()) ? 'Unknown Date' : date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {});

  const orderedKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Unknown Date') return 1;
    if (b === 'Unknown Date') return -1;
    return new Date(groups[b][0].createdAt).getTime() - new Date(groups[a][0].createdAt).getTime();
  });

  orderedKeys.forEach((dateKey) => {
    const dateRow = document.createElement('tr');
    dateRow.className = 'orders-date-row';
    dateRow.innerHTML = `<td colspan="6">${escapeHtml(dateKey)}</td>`;
    tbody.appendChild(dateRow);

    groups[dateKey].forEach((order) => {
      const itemsText = order.items
        .map((item) => `${item.foodID?.name || 'Unknown'} x ${item.quantity}`)
        .join(', ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${order.orderID}</td>
        <td>${order.studentID?.name || 'Unknown'}</td>
        <td>${itemsText}</td>
        <td>${formatCurrency(order.total)}</td>
        <td><span class="status-badge ${getStatusClass(order.status)}">${order.status}</span></td>
        <td>
          <div class="btn-group">
            <button class="btn btn-small ${order.status === 'Preparing' ? 'btn-primary' : 'btn-secondary'}" data-id="${order._id}" data-status="Preparing">Preparing</button>
            <button class="btn btn-small ${order.status === 'Ready' ? 'btn-primary' : 'btn-secondary'}" data-id="${order._id}" data-status="Ready">Ready</button>
            <button class="btn btn-small ${order.status === 'Delivered' ? 'btn-primary' : 'btn-secondary'}" data-id="${order._id}" data-status="Delivered">Delivered</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });
}

async function initOrdersPage() {
  const canID = requireCanID();
  if (!canID) return;

  applyAdminHeaderIdentity(canID);
  let isLoadingOrders = false;
  let ordersPollTimer = null;

  async function loadOrders() {
    if (isLoadingOrders) return;
    isLoadingOrders = true;
    try {
      const orders = await safeFetch(`${API_BASE}/orders/${canID}`);
      renderOrders(orders);
    } catch (error) {
      alert(error.message);
    } finally {
      isLoadingOrders = false;
    }
  }

  document.getElementById('ordersBody').addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    try {
      await safeFetch(`${API_BASE}/order/${button.dataset.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: button.dataset.status })
      });
      alert('Order status updated');
      loadOrders();
    } catch (error) {
      alert(error.message);
    }
  });

  loadOrders();
  ordersPollTimer = setInterval(loadOrders, 5000);

  window.addEventListener('beforeunload', () => {
    if (ordersPollTimer) clearInterval(ordersPollTimer);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadOrders();
    }
  });
}

async function initAnalyticsPage() {
  const canID = requireCanID();
  if (!canID) return;
  applyAdminHeaderIdentity(canID);

  try {
    const {
      stats = {},
      revenueTrend = [],
      ordersByStatus = [],
      topMenuItems = []
    } = await safeFetch(`${API_BASE}/admin/analytics/${canID}`);
    const statCards = document.querySelectorAll('.stat-card .stat-value');

    if (statCards.length === 4) {
      statCards[0].textContent = formatCurrency(stats.monthlySales);
      statCards[1].textContent = formatCurrency(stats.avgOrderValue);
      statCards[2].textContent = stats.topSellingItem || 'N/A';
      statCards[3].textContent = String(stats.ordersToday || 0);
    }

    const revenueTrendList = document.getElementById('revenueTrendList');
    if (revenueTrendList) {
      if (!revenueTrend.length) {
        revenueTrendList.innerHTML = '<li class="analytics-empty">No sales this month yet.</li>';
      } else {
        const maxRevenue = Math.max(...revenueTrend.map((entry) => Number(entry.total || 0)), 1);
        revenueTrendList.innerHTML = revenueTrend.map((entry) => {
          const total = Number(entry.total || 0);
          const barWidth = Math.max((total / maxRevenue) * 100, 2);
          const fallbackDate = entry.day
            ? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(entry.day).padStart(2, '0')}`
            : '';
          const rawDate = String(entry.date || fallbackDate || '').trim();
          const parsed = rawDate ? new Date(`${rawDate}T00:00:00`) : null;
          const dateLabel = parsed && !Number.isNaN(parsed.getTime())
            ? parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : escapeHtml(rawDate || '-');
          return `
            <li class="analytics-row">
              <span class="analytics-key">${dateLabel}</span>
              <span class="analytics-bar-wrap"><span class="analytics-bar" style="width:${barWidth}%"></span></span>
              <span class="analytics-value">${formatCurrency(total)}</span>
            </li>
          `;
        }).join('');
      }
    }

    const ordersStatusList = document.getElementById('ordersStatusList');
    if (ordersStatusList) {
      if (!ordersByStatus.length) {
        ordersStatusList.innerHTML = '<li class="analytics-empty">No orders found.</li>';
      } else {
        const maxCount = Math.max(...ordersByStatus.map((entry) => Number(entry.count || 0)), 1);
        ordersStatusList.innerHTML = ordersByStatus.map((entry) => {
          const count = Number(entry.count || 0);
          const barWidth = Math.max((count / maxCount) * 100, 2);
          return `
            <li class="analytics-row">
              <span class="analytics-key">${escapeHtml(entry.status || 'Unknown')}</span>
              <span class="analytics-bar-wrap"><span class="analytics-bar" style="width:${barWidth}%"></span></span>
              <span class="analytics-value">${count}</span>
            </li>
          `;
        }).join('');
      }
    }

    const topItemsBody = document.getElementById('topItemsBody');
    if (topItemsBody) {
      if (!topMenuItems.length) {
        topItemsBody.innerHTML = '<tr><td colspan="2" class="analytics-empty">No item sales yet.</td></tr>';
      } else {
        topItemsBody.innerHTML = topMenuItems.map((item) => `
          <tr>
            <td>${escapeHtml(item.name || 'Unknown')}</td>
            <td>${Number(item.quantity || 0)}</td>
          </tr>
        `).join('');
      }
    }
  } catch (error) {
    alert(error.message);
  }
}

async function initStudentSignupPage() {
  const form = document.getElementById('studentSignupForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      canID: document.getElementById('canID').value.trim(),
      name: document.getElementById('name').value.trim(),
      classSemester: document.getElementById('classSemester').value.trim(),
      mobile: normalizeMobile(document.getElementById('mobile').value),
      email: document.getElementById('email').value.trim(),
      admissionNumber: document.getElementById('admissionNumber').value.trim().toUpperCase(),
      password: document.getElementById('password').value
    };
    const validationError = validateStudentSignupPayload(payload);
    if (validationError) {
      showSnack(validationError, 'error');
      return;
    }

    try {
      const data = await safeFetch(`${API_BASE}/student/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!data?.student?._id || !data?.student?.canID) {
        throw new Error(data?.message || 'Invalid signup response from server');
      }

      setStudentSession({
        studentID: data.student._id,
        canID: data.student.canID,
        name: data.student.name,
        classSemester: data.student.classSemester,
        mobile: data.student.mobile,
        email: data.student.email,
        admissionNumber: data.student.admissionNumber,
        banned: data.student.banned
      });

      showSnack('Student signup successful', 'success');
      window.location.href = STUDENT_ROUTES.home;
    } catch (error) {
      showSnack(error.message, 'error');
    }
  });
}

async function initStudentLoginPage() {
  const form = document.getElementById('studentLoginForm');
  const identifierInput = document.getElementById('studentIdentifier');
  if (!form || !identifierInput) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = identifierInput.value.trim();
    const loginWith = isValidMobile(normalizeMobile(identifier)) ? 'mobile' : 'email';
    const payload = {
      loginWith,
      identifier,
      password: document.getElementById('password').value
    };
    if (loginWith === 'mobile' && !isValidMobile(normalizeMobile(identifier))) {
      showSnack('Please enter a valid 10-digit mobile number', 'error');
      return;
    }
    if (loginWith === 'email' && !isValidEmail(identifier)) {
      showSnack('Please enter a valid email address', 'error');
      return;
    }
    if (!isValidPassword(payload.password)) {
      showSnack('Password must be at least 8 characters', 'error');
      return;
    }

    try {
      const data = await safeFetch(`${API_BASE}/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!data?.student?._id || !data?.student?.canID) {
        throw new Error(data?.message || 'Invalid login response from server');
      }

      setStudentSession({
        studentID: data.student._id,
        canID: data.student.canID,
        name: data.student.name,
        classSemester: data.student.classSemester,
        mobile: data.student.mobile,
        email: data.student.email,
        admissionNumber: data.student.admissionNumber,
        banned: data.student.banned
      });

      showSnack('Student login successful', 'success');
      window.location.href = STUDENT_ROUTES.home;
    } catch (error) {
      showSnack(error.message, 'error');
    }
  });
}

function renderStudentMenu(foods) {
  const container = document.getElementById('studentMenuBody');
  if (!container) return;

  if (!foods.length) {
    container.innerHTML = '<div class="empty-block">No menu items available right now.</div>';
    return;
  }

  container.innerHTML = foods.map((food) => `
    <article class="menu-card" data-food-card data-food-id="${food._id}" data-food-name="${escapeHtml(food.name)}" data-food-price="${Number(food.price || 0)}" data-food-stock="${food.inStock}">
      <img
        class="menu-image"
        src="${escapeHtml(resolveFoodImage(food))}"
        alt="${escapeHtml(food.name)}"
        loading="lazy"
      />
      <div class="menu-card-body">
        <div class="menu-head">
          <div>
            <h3 class="food-name">${escapeHtml(food.name)}</h3>
            <p class="food-price">${formatCurrency(food.price)}</p>
          </div>
          <span class="chip ${food.inStock ? 'chip-stock' : 'chip-out'}">${food.inStock ? 'In Stock' : 'Out of Stock'}</span>
        </div>

        <div class="qty-row">
          <button class="qty-btn" type="button" data-action="qty-dec" ${food.inStock ? '' : 'disabled'} aria-label="Decrease quantity">-</button>
          <input
            class="qty-input"
            type="number"
            min="0"
            step="1"
            value="0"
            data-food-id="${food._id}"
            ${food.inStock ? '' : 'disabled'}
            aria-label="${escapeHtml(food.name)} quantity"
          />
          <button class="qty-btn" type="button" data-action="qty-inc" ${food.inStock ? '' : 'disabled'} aria-label="Increase quantity">+</button>
        </div>

        <div class="menu-actions">
          <button class="btn btn-primary" type="button" data-action="add-to-cart" ${food.inStock ? '' : 'disabled'}>Add to Cart</button>
        </div>
      </div>
    </article>
  `).join('');
}

function renderStudentOrders(orders) {
  const container = document.getElementById('studentOrdersBody');
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = '<div class="empty-block">You have not placed any orders yet.</div>';
    return;
  }

  container.innerHTML = orders.map((order) => {
    const itemsText = order.items
      .map((item) => `${item.foodID?.name || 'Unknown'} x ${item.quantity}`)
      .join(', ');
    const statusClass = order.status === 'Ready'
      ? 'chip-ready'
      : order.status === 'Delivered'
        ? 'chip-delivered'
        : 'chip-preparing';

    return `
      <article class="order-card">
        <div class="order-top">
          <p class="order-id">Order ID: ${order.orderID}</p>
          <span class="chip ${statusClass}">${order.status}</span>
        </div>
        <p class="order-items">${itemsText}</p>
        <p class="order-total">Total: ${formatCurrency(order.total)}</p>
      </article>
    `;
  }).join('');
}

async function initStudentPortalPage() {
  const session = requireStudentSession();
  if (!session) return;

  setText('studentNameValue', session.name);
  setText('studentCanIDValue', session.canID);
  const menuContainer = document.getElementById('studentMenuBody');
  const cartContainer = document.getElementById('cartItemsBody');
  const cartTotalValue = document.getElementById('cartTotalValue');
  const placeOrderBtn = document.getElementById('placeOrderBtn');

  let cart = [];
  let isLoadingOrders = false;
  let ordersPollTimer = null;

  function renderCart() {
    if (!cartContainer || !cartTotalValue || !placeOrderBtn) return;

    if (cart.length === 0) {
      cartContainer.innerHTML = '<div class="empty-block">Your cart is empty. Add items from the menu.</div>';
      cartTotalValue.textContent = formatCurrency(0);
      placeOrderBtn.textContent = 'Place Order';
      return;
    }

    const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    cartContainer.innerHTML = cart.map((item) => `
      <article class="cart-item">
        <div>
          <p class="cart-item-title">${item.name}</p>
          <p class="cart-item-meta">${formatCurrency(item.price)} x ${item.quantity}</p>
        </div>
        <button class="btn btn-soft" type="button" data-action="remove-cart-item" data-id="${item.foodID}">Remove</button>
      </article>
    `).join('');
    cartTotalValue.textContent = formatCurrency(total);
    placeOrderBtn.textContent = `Place Order - ${formatCurrency(total)}`;
  }

  async function loadMenu() {
    try {
      const foods = await safeFetch(`${API_BASE}/foods/${session.canID}`);
      renderStudentMenu(foods);
    } catch (error) {
      alert(error.message);
    }
  }

  async function loadMyOrders() {
    if (isLoadingOrders) return;
    isLoadingOrders = true;
    try {
      const orders = await safeFetch(`${API_BASE}/student/orders/${session.studentID}?canID=${encodeURIComponent(session.canID)}`);
      renderStudentOrders(orders);
    } catch (_) {
      // keep polling silently for transient network errors
    } finally {
      isLoadingOrders = false;
    }
  }

  menuContainer.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    const card = button.closest('[data-food-card]');
    if (!card) return;

    const qtyInput = card.querySelector('input[data-food-id]');
    if (!qtyInput) return;

    if (button.dataset.action === 'qty-inc') {
      qtyInput.value = String(Number(qtyInput.value || 0) + 1);
      return;
    }

    if (button.dataset.action === 'qty-dec') {
      qtyInput.value = String(Math.max(0, Number(qtyInput.value || 0) - 1));
      return;
    }

    if (button.dataset.action === 'add-to-cart') {
      const quantity = Number(qtyInput.value);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        alert('Please select a quantity greater than 0');
        return;
      }

      const foodID = card.dataset.foodId;
      const name = card.dataset.foodName;
      const price = Number(card.dataset.foodPrice);
      const existing = cart.find((item) => item.foodID === foodID);
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.push({ foodID, name, price, quantity });
      }

      qtyInput.value = '0';
      renderCart();
    }
  });

  cartContainer.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action="remove-cart-item"]');
    if (!button) return;
    cart = cart.filter((item) => item.foodID !== button.dataset.id);
    renderCart();
  });

  placeOrderBtn.addEventListener('click', async () => {
    const items = cart.map((item) => ({
      foodID: item.foodID,
      quantity: Number(item.quantity)
    })).filter((item) => item.quantity > 0);

    if (!items.length) {
      alert('Please select at least one item');
      return;
    }

    try {
      await safeFetch(`${API_BASE}/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canID: session.canID,
          studentID: session.studentID,
          items
        })
      });
      alert('Order placed');
      cart = [];
      renderCart();
      await loadMenu();
      await loadMyOrders();
    } catch (error) {
      alert(error.message);
    }
  });

  renderCart();
  loadMenu();
  loadMyOrders();
  ordersPollTimer = setInterval(loadMyOrders, 5000);

  window.addEventListener('beforeunload', () => {
    if (ordersPollTimer) clearInterval(ordersPollTimer);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadMyOrders();
    }
  });
}

function renderStudentHomeFoods(foods) {
  const grid = document.getElementById('studentHomeFoodsGrid');
  if (!grid) return;

  if (!foods.length) {
    grid.innerHTML = '<div class="s-card s-empty">No items match this filter.</div>';
    return;
  }

  grid.innerHTML = foods.map((food) => `
    <article class="s-card s-food-card">
      <img
        class="s-food-image"
        src="${escapeHtml(resolveFoodImage(food))}"
        alt="${escapeHtml(food.name)}"
        loading="lazy"
      />
      <div class="s-food-body">
        <div class="s-food-head">
          <h3>${escapeHtml(food.name)}</h3>
          <span class="s-chip ${food.inStock ? 's-chip-success' : 's-chip-danger'}">${food.inStock ? 'Available' : 'Out of Stock'}</span>
        </div>
        <div class="s-food-foot">
          <p class="s-price">${formatCurrency(food.price)}</p>
          <button class="s-btn s-btn-primary s-btn-cart" data-action="add" data-id="${food._id}" ${food.inStock ? '' : 'disabled'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6.2"/></svg>
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

function updateStudentCartBadge(animate = false) {
  const badge = document.getElementById('studentCartCount');
  if (!badge) return;
  const count = getStudentCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  badge.textContent = String(count);
  if (animate) {
    badge.classList.remove('is-bumped');
    void badge.offsetWidth;
    badge.classList.add('is-bumped');
  }
}

function showStudentSnackbar(message) {
  // Reuse one snackbar element to keep DOM simple and lightweight.
  let snackbar = document.getElementById('studentSnackbar');
  if (!snackbar) {
    snackbar = document.createElement('div');
    snackbar.id = 'studentSnackbar';
    snackbar.className = 's-snackbar';
    document.body.appendChild(snackbar);
  }

  // Reset animation state, then show the new message.
  snackbar.textContent = message;
  snackbar.classList.remove('is-visible');
  void snackbar.offsetWidth;
  snackbar.classList.add('is-visible');

  // Auto-hide after a short delay.
  clearTimeout(showStudentSnackbar._timer);
  showStudentSnackbar._timer = setTimeout(() => {
    snackbar.classList.remove('is-visible');
  }, 1800);
}

async function initStudentHomePage() {
  const session = requireStudentSession();
  if (!session) return;

  // Check if student is banned
  if (session.banned) {
    alert('Your account has been banned. Please contact support.');
    clearStudentSession();
    window.location.href = STUDENT_ROUTES.login;
    return;
  }

  setText('studentNameValue', session.name);
  setText('studentCanIDValue', session.canID);
  updateStudentCartBadge();

  const searchInput = document.getElementById('studentSearchInput');
  const filterWrap = document.getElementById('studentFilterGroup');
  let allFoods = [];
  let activeCategory = 'all';
  let query = '';

  function classifyFood(food) {
    return normalizeFoodCategory(food.category);
  }

  function applyFilters() {
    const filtered = allFoods.filter((food) => {
      const category = classifyFood(food);
      const categoryMatch = activeCategory === 'all' || activeCategory === category;
      const searchMatch = !query || food.name.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });
    renderStudentHomeFoods(filtered);
  }

  try {
    allFoods = await safeFetch(`${API_BASE}/foods/${session.canID}`);
    applyFilters();
  } catch (error) {
    alert(error.message);
  }

  filterWrap?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-filter]');
    if (!button) return;
    activeCategory = button.dataset.filter;
    filterWrap.querySelectorAll('button[data-filter]').forEach((b) => b.classList.remove('is-active'));
    button.classList.add('is-active');
    applyFilters();
  });

  searchInput?.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    applyFilters();
  });

  document.getElementById('studentHomeFoodsGrid')?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action="add"]');
    if (!button) return;

    const food = allFoods.find((item) => item._id === button.dataset.id);
    if (!food || !food.inStock) return;

    const cart = getStudentCart();
    const existing = cart.find((item) => item.foodID === food._id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        foodID: food._id,
        name: food.name,
        price: Number(food.price || 0),
        quantity: 1
      });
    }
    setStudentCart(cart);
    button.classList.remove('is-added');
    void button.offsetWidth;
    button.classList.add('is-added');
    updateStudentCartBadge(true);
    showStudentSnackbar('Item added to cart');
  });
}

function renderCartPage() {
  const items = getStudentCart();
  const list = document.getElementById('studentCartItems');
  const subtotalEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');
  const proceedBtn = document.getElementById('proceedToPaymentBtn');
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const total = subtotal;

  if (list) {
    if (!items.length) {
      list.innerHTML = '<div class="s-card s-empty">Your cart is empty.</div>';
    } else {
      list.innerHTML = items.map((item) => `
        <article class="s-card s-cart-item">
          <div>
            <h3>${item.name}</h3>
            <p>${formatCurrency(item.price)} each</p>
          </div>
          <div class="s-cart-actions">
            <button class="s-icon-btn" data-action="dec" data-id="${item.foodID}">-</button>
            <span>${item.quantity}</span>
            <button class="s-icon-btn" data-action="inc" data-id="${item.foodID}">+</button>
            <button class="s-btn s-btn-ghost" data-action="remove" data-id="${item.foodID}">Remove</button>
          </div>
        </article>
      `).join('');
    }
  }

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(total);
  if (proceedBtn) proceedBtn.disabled = items.length === 0;
}

async function initStudentCartPage() {
  const session = requireStudentSession();
  if (!session) return;
  setText('studentNameValue', session.name);

  renderCartPage();
  updateStudentCartBadge();

  document.getElementById('studentCartItems')?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-id]');
    if (!button) return;

    let cart = getStudentCart();
    const item = cart.find((it) => it.foodID === button.dataset.id);
    if (!item) return;

    if (button.dataset.action === 'inc') item.quantity += 1;
    if (button.dataset.action === 'dec') item.quantity = Math.max(1, item.quantity - 1);
    if (button.dataset.action === 'remove') cart = cart.filter((it) => it.foodID !== button.dataset.id);

    setStudentCart(cart);
    renderCartPage();
    updateStudentCartBadge();
  });

  document.getElementById('proceedToPaymentBtn')?.addEventListener('click', () => {
    window.location.href = STUDENT_ROUTES.payment;
  });
}

function renderPaymentSummary() {
  const items = getStudentCart();
  const summary = document.getElementById('paymentSummaryItems');
  const totalEl = document.getElementById('paymentTotal');
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const total = subtotal;

  if (summary) {
    if (!items.length) {
      summary.innerHTML = '<div class="s-empty">No items in cart.</div>';
    } else {
      summary.innerHTML = items.map((item) => `
        <div class="s-summary-row">
          <span>${item.name} x ${item.quantity}</span>
          <strong>${formatCurrency(Number(item.price) * Number(item.quantity))}</strong>
        </div>
      `).join('');
    }
  }

  if (totalEl) totalEl.textContent = formatCurrency(total);
  return { items, total };
}

async function initStudentPaymentPage() {
  const session = requireStudentSession();
  if (!session) return;

  // Check if student is banned
  if (session.banned) {
    alert('Your account has been banned. Please contact support.');
    clearStudentSession();
    window.location.href = STUDENT_ROUTES.login;
    return;
  }

  updateStudentCartBadge();
  const payBtn = document.getElementById('payNowBtn');
  const { items } = renderPaymentSummary();
  if (payBtn) payBtn.disabled = items.length === 0;

  payBtn?.addEventListener('click', async () => {
    const cart = getStudentCart();
    if (!cart.length) {
      alert('Cart is empty');
      return;
    }

    try {
      if (typeof window.Razorpay !== 'function') {
        throw new Error('Payment gateway failed to load. Please refresh and try again.');
      }

      if (payBtn) payBtn.disabled = true;

      const orderPayload = {
        canID: session.canID,
        studentID: session.studentID,
        items: cart.map((item) => ({
          foodID: item.foodID,
          quantity: Number(item.quantity)
        }))
      };

      const razorpayOrder = await safeFetch(`${API_BASE}/payment/razorpay/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const rz = new window.Razorpay({
        key: razorpayOrder.keyId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency || 'INR',
        name: 'CampusBites',
        description: 'Student canteen order payment',
        order_id: razorpayOrder.razorpayOrderId,
        prefill: {
          name: session.name || '',
          email: session.email || '',
          contact: normalizeMobile(session.mobile || '')
        },
        notes: {
          canID: session.canID,
          studentID: session.studentID
        },
        theme: {
          color: '#f97316'
        },
        modal: {
          ondismiss: () => {
            if (payBtn) payBtn.disabled = false;
          }
        },
        handler: async (paymentResult) => {
          try {
            const response = await safeFetch(`${API_BASE}/payment/razorpay/verify-and-place`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...orderPayload,
                razorpay_order_id: paymentResult.razorpay_order_id,
                razorpay_payment_id: paymentResult.razorpay_payment_id,
                razorpay_signature: paymentResult.razorpay_signature
              })
            });

            localStorage.setItem('studentLastOrderID', response.order?.orderID || '');
            clearStudentCart();
            window.location.replace(STUDENT_ROUTES.orders);
          } catch (error) {
            showSnack(error.message || 'Payment verification failed', 'error');
            if (payBtn) payBtn.disabled = false;
          }
        }
      });

      rz.on('payment.failed', (event) => {
        const reason = event?.error?.description || event?.error?.reason || 'Payment failed. Please try again.';
        showSnack(reason, 'error');
        if (payBtn) payBtn.disabled = false;
      });

      rz.open();
    } catch (error) {
      alert(error.message);
      if (payBtn) payBtn.disabled = false;
    }
  });
}

function initStudentOrderSuccessPage() {
  const session = requireStudentSession();
  if (!session) return;
  const orderID = localStorage.getItem('studentLastOrderID') || 'ORD-PENDING';
  setText('successOrderID', orderID);
  updateStudentCartBadge();
}

async function initStudentOrdersPage() {
  const session = requireStudentSession();
  if (!session) return;

  // Check if student is banned
  if (session.banned) {
    alert('Your account has been banned. Please contact support.');
    clearStudentSession();
    window.location.href = STUDENT_ROUTES.login;
    return;
  }
  const container = document.getElementById('studentOrdersList');
  const modal = document.getElementById('orderQrModal');
  const closeBtn = document.getElementById('orderQrModalClose');
  updateStudentCartBadge();
  let isLoadingOrders = false;
  let ordersPollTimer = null;
  let currentOrders = [];

  async function loadStudentOrders() {
    if (isLoadingOrders) return;
    isLoadingOrders = true;
    try {
      const orders = await safeFetch(`${API_BASE}/student/orders/${session.studentID}?canID=${encodeURIComponent(session.canID)}`);
      currentOrders = Array.isArray(orders) ? orders : [];
      if (!container) return;
      if (!currentOrders.length) {
        container.innerHTML = '<div class="s-card s-empty">No orders yet.</div>';
        return;
      }

      container.innerHTML = currentOrders.map((order) => {
        const itemsText = order.items
          .map((item) => `${item.foodID?.name || 'Unknown'} x ${item.quantity}`)
          .join(', ');
        const displayStatus = order.status === 'Preparing' ? 'Processing' : order.status;
        const statusClass = order.status === 'Ready'
          ? 's-chip-info'
          : order.status === 'Delivered'
            ? 's-chip-success'
            : 's-chip-warn';

        return `
          <article class="s-card s-order-item" data-order-id="${order._id}">
            <div class="s-order-head">
              <h3>${order.orderID}</h3>
              <span class="s-chip ${statusClass}">${displayStatus}</span>
            </div>
            <p>${itemsText}</p>
            <p class="s-order-total">${formatCurrency(order.total)}</p>
          </article>
        `;
      }).join('');
    } catch (_) {
      // keep polling silently for transient network errors
    } finally {
      isLoadingOrders = false;
    }
  }

  loadStudentOrders();
  ordersPollTimer = setInterval(loadStudentOrders, 5000);

  container?.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-order-id]');
    if (!card) return;
    const order = currentOrders.find((entry) => entry._id === card.dataset.orderId);
    if (!order) return;
    await openOrderQrModal(order);
  });

  closeBtn?.addEventListener('click', closeOrderQrModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeOrderQrModal();
  });

  window.addEventListener('beforeunload', () => {
    if (ordersPollTimer) clearInterval(ordersPollTimer);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadStudentOrders();
    }
  });
}

function initStudentProfilePage() {
  const session = requireStudentSession();
  if (!session) return;

  // Check if student is banned
  if (session.banned) {
    alert('Your account has been banned. Please contact support.');
    clearStudentSession();
    window.location.href = STUDENT_ROUTES.login;
    return;
  }

  setText('profileName', session.name || '-');
  setText('profileEmail', session.email || '-');
  setText('profileCanID', session.canID || '-');
  setText('profileClassSemester', session.classSemester || '-');
  setText('profileMobile', session.mobile || '-');
  setText('profileAdmissionNumber', session.admissionNumber || '-');
  setText('profileAvatar', (session.name || 'S').trim().charAt(0).toUpperCase() || 'S');
  updateStudentCartBadge();

  document.getElementById('profileOrdersBtn')?.addEventListener('click', () => {
    window.location.href = STUDENT_ROUTES.orders;
  });
}

async function initAdminScanPage() {
  const canID = requireCanID();
  if (!canID) return;
  applyAdminHeaderIdentity(canID);

  const statusEl = document.getElementById('scanStatus');
  const resultEl = document.getElementById('scanResult');
  const readerId = 'reader';
  let scanLock = false;
  let scanner = null;
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function setResult(message, isError = false) {
    if (!resultEl) return;
    resultEl.textContent = message;
    resultEl.classList.toggle('scan-error', isError);
    resultEl.classList.toggle('scan-success', !isError);
  }

  function getScannerErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    const name = typeof error.name === 'string' ? error.name : '';
    const message = typeof error.message === 'string' ? error.message : '';
    if (name && message) return `${name}: ${message}`;
    if (message) return message;
    if (name) return name;
    try {
      return JSON.stringify(error);
    } catch (_) {
      return 'Unknown error';
    }
  }

  async function processToken(tokenText) {
    if (scanLock) return;
    scanLock = true;
    setStatus('Processing scan...');
    try {
      const data = await safeFetch(`${API_BASE}/api/orders/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenText })
      });
      const scannedOrderId = data?.order?.orderID || 'Unknown';
      const scannedStatus = data?.order?.status || 'Unknown';
      setResult(`Success: ${scannedOrderId} -> ${scannedStatus}`, false);
      setStatus('Ready to scan next QR');
    } catch (error) {
      setResult(error.message || 'Scan failed', true);
      setStatus('Scan failed. Try another QR');
    } finally {
      setTimeout(() => {
        scanLock = false;
      }, 1200);
    }
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

  try {
    if (!window.isSecureContext && !isLocalhost) {
      setStatus('Unable to start scanner: camera access on mobile requires HTTPS (or localhost).');
      setResult('Open this admin page using HTTPS or localhost, then allow camera permission.', true);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Unable to start scanner: this browser does not support camera access.');
      setResult('Use a modern Chrome/Safari browser on mobile.', true);
      return;
    }

    if (!window.Html5Qrcode) {
      throw new Error('Scanner library not loaded');
    }

    scanner = new window.Html5Qrcode(readerId);
    let cameraConfig = { facingMode: { ideal: 'environment' } };
    if (typeof window.Html5Qrcode.getCameras === 'function') {
      try {
        const cameras = await window.Html5Qrcode.getCameras();
        const preferredCamera = pickPreferredBackCamera(cameras);
        if (preferredCamera?.id) {
          cameraConfig = preferredCamera.id;
        }
      } catch (_) {
        // fall back to facingMode if camera list fetch fails
      }
    }

    await scanner.start(
      cameraConfig,
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        await processToken(decodedText);
      }
    );

    try {
      await scanner.applyVideoConstraints({ advanced: [{ zoom: 1 }] });
    } catch (_) {
      // zoom constraint may not be supported on all devices
    }

    setStatus('Scanner started. Point camera at order QR');
  } catch (error) {
    const scannerError = getScannerErrorMessage(error);
    setStatus(`Unable to start scanner: ${scannerError}`);
    setResult('No scan yet.', true);
  }

  window.addEventListener('beforeunload', async () => {
    if (scanner && scanner.isScanning) {
      try {
        await scanner.stop();
      } catch (_) {
        // ignore scanner stop errors while unloading
      }
    }
  });
}

function initCommonActions() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearCanID();
      clearAdminEmail();
      window.location.href = 'admin-login.html';
    });
  }

  const studentLogoutBtn = document.getElementById('studentLogoutBtn');
  if (studentLogoutBtn) {
    studentLogoutBtn.addEventListener('click', async () => {
      try {
        await safeFetch(`${API_BASE}/student/logout`, { method: 'POST' });
      } catch (_) {
        // Local cleanup and redirect still proceed even if API call fails.
      }
      clearStudentSession();
      clearStudentCart();
      window.location.href = STUDENT_ROUTES.login;
    });
  }
}

function initStudentBanWatcher() {
  const page = document.body?.dataset?.page || '';
  if (!page.startsWith('student-')) return;

  let banWatcherTimer = null;
  let isCheckingBan = false;
  let hasHandledBan = false;

  async function checkBanStatus() {
    if (isCheckingBan || hasHandledBan) return;
    const session = getStudentSession();
    if (!session?.studentID || !session?.canID) return;

    isCheckingBan = true;
    try {
      const data = await safeFetch(
        `${API_BASE}/student/session/${session.studentID}?canID=${encodeURIComponent(session.canID)}`
      );

      if (data?.banned) {
        hasHandledBan = true;
        clearStudentSession();
        clearStudentCart();
        alert('Your account has been banned. Please contact support.');
        window.location.href = STUDENT_ROUTES.login;
      }
    } catch (_) {
      // Ignore transient errors; next poll will retry.
    } finally {
      isCheckingBan = false;
    }
  }

  checkBanStatus();
  banWatcherTimer = setInterval(checkBanStatus, 5000);

  window.addEventListener('beforeunload', () => {
    if (banWatcherTimer) clearInterval(banWatcherTimer);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkBanStatus();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ensureNotifySystem();
  window.alert = (message) => showPopupAlert(message, 'info');
  initAuthPageTransitions();
  initCommonActions();
  initStudentBanWatcher();
  const page = document.body.dataset.page;

  if (page === 'signup') initSignupPage();
  if (page === 'login') initLoginPage();
  if (page === 'dashboard') initDashboardPage();
  if (page === 'menu') initMenuPage();
  if (page === 'students') initStudentsPage();
  if (page === 'orders') initOrdersPage();
  if (page === 'analytics') initAnalyticsPage();
  if (page === 'staffs') initStaffsPage();
  if (page === 'admin-scan') initAdminScanPage();
  if (page === 'student-signup') initStudentSignupPage();
  if (page === 'student-login') initStudentLoginPage();
  if (page === 'student-portal') initStudentPortalPage();
  if (page === 'student-home') initStudentHomePage();
  if (page === 'student-cart') initStudentCartPage();
  if (page === 'student-payment') initStudentPaymentPage();
  if (page === 'student-order-success') initStudentOrderSuccessPage();
  if (page === 'student-orders') initStudentOrdersPage();
  if (page === 'student-profile') initStudentProfilePage();
});
