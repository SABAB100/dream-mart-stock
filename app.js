// Dream Mart shoe stock — frontend.
// Talks to /api/shoes, /api/sell, /api/sales and /api/upload.
// Auth: the shop password is sent as the x-app-password header on every
// call and kept only in sessionStorage (never in the page or a cookie).
// Nothing here ever deletes or clears anything on its own: only the
// user's own Delete buttons remove a shoe or a sale entry.

const $ = (id) => document.getElementById(id);
let shoes = [];
let sales = [];
let editingId = null; // shoe id being edited, or null when adding
let pendingPictureDataUrl = null; // newly chosen picture (base64), if any
let existingPictureUrl = null; // picture already saved for the shoe being edited

function password() {
  return sessionStorage.getItem('dm-password') || '';
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-app-password': password(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showError(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}
function hideError(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

function totalPairs(shoe) {
  return Object.values(shoe.sizes || {}).reduce((sum, q) => sum + (Number(q) || 0), 0);
}

function sizesText(shoe) {
  return Object.entries(shoe.sizes || {})
    .map(([size, qty]) => ({ size, qty: Number(qty) || 0 }))
    .sort((a, b) => (parseFloat(a.size) - parseFloat(b.size)) || String(a.size).localeCompare(String(b.size)))
    .map(({ size, qty }) =>
      qty <= 2 && qty > 0
        ? `<span class="low">Size ${escapeHtml(size)}: ${qty}</span>`
        : `Size ${escapeHtml(size)}: ${qty}`
    )
    .join(' • ');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filteredShoes() {
  const q = ($('search-input').value || '').trim().toLowerCase();
  if (!q) return shoes;
  return shoes.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.colour && s.colour.toLowerCase().includes(q))
  );
}

function renderSummary() {
  const list = $('summary-list');
  const items = filteredShoes();
  if (!items.length) {
    list.innerHTML = '<p>No shoes found.</p>';
    return;
  }
  list.innerHTML = items
    .map((shoe) => {
      const total = totalPairs(shoe);
      const totalLabel = total === 0 ? '<span class="low">Finished</span>' : `${total} pairs`;
      const nameLabel = shoe.colour ? `${shoe.name} (${shoe.colour})` : shoe.name;
      return (
        `<div class="summary-row"><span class="name">${escapeHtml(nameLabel)}</span>` +
        `<span class="dots"></span><span class="total">${totalLabel}</span></div>` +
        `<div class="summary-sizes">${sizesText(shoe) || 'No sizes yet'}</div>`
      );
    })
    .join('');
}

function renderCards() {
  const container = $('cards');
  const items = filteredShoes();
  $('empty-message').classList.toggle('hidden', items.length > 0 || shoes.length > 0);
  if (!items.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = items
    .map((shoe) => {
      const total = totalPairs(shoe);
      const sizeOptions = Object.entries(shoe.sizes || {})
        .map(([size, qty]) => ({ size, qty: Number(qty) || 0 }))
        .sort((a, b) => (parseFloat(a.size) - parseFloat(b.size)) || String(a.size).localeCompare(String(b.size)))
        .map(
          ({ size, qty }) =>
            `<option value="${escapeHtml(size)}" ${qty <= 0 ? 'disabled' : ''}>Size ${escapeHtml(size)} (${qty} left)</option>`
        )
        .join('');
      return (
        `<div class="card" data-id="${shoe.id}">` +
        (shoe.imageUrl
          ? `<img class="shoe-photo" src="${escapeHtml(shoe.imageUrl)}" alt="${escapeHtml(shoe.name)}" />`
          : '') +
        `<h3>${escapeHtml(shoe.name)}</h3>` +
        (shoe.colour ? `<p class="colour">Colour: ${escapeHtml(shoe.colour)}</p>` : '') +
        (shoe.price !== null && shoe.price !== undefined
          ? `<p class="price">৳${shoe.price} / pair</p>`
          : '') +
        `<div class="sizes">${sizesText(shoe) || 'No sizes yet'}</div>` +
        (total === 0
          ? '<p class="finished">Finished — no stock left</p>'
          : `<div class="sell-row">
              <select class="sell-size">${sizeOptions}</select>
              <input class="sell-qty" type="number" min="1" step="1" value="1" />
              <button class="sell-button">Sell</button>
            </div>`) +
        `<div class="card-actions">
            <button class="edit-button">Edit</button>
            <button class="delete-button danger">Delete</button>
          </div>` +
        `</div>`
      );
    })
    .join('');

  container.querySelectorAll('.card').forEach((card) => {
    const id = card.dataset.id;
    const sellBtn = card.querySelector('.sell-button');
    if (sellBtn) {
      sellBtn.addEventListener('click', async () => {
        const size = card.querySelector('.sell-size').value;
        const qty = Number(card.querySelector('.sell-qty').value);
        if (!size || !Number.isInteger(qty) || qty < 1) {
          alert('Choose a size and a quantity of 1 or more.');
          return;
        }
        try {
          const result = await api('/api/sell', {
            method: 'POST',
            body: JSON.stringify({ shoeId: id, size, qty }),
          });
          alert(`Sold ${qty} pair(s), size ${size}. ${result.left} left for this shoe.`);
          await loadAll();
        } catch (err) {
          alert(err.message);
        }
      });
    }
    card.querySelector('.edit-button').addEventListener('click', () => startEdit(id));
    card.querySelector('.delete-button').addEventListener('click', async () => {
      const shoe = shoes.find((s) => s.id === id);
      if (!shoe) return;
      if (!confirm(`Delete ${shoe.name}? Its sales history will stay.`)) return;
      try {
        await api('/api/shoes', { method: 'DELETE', body: JSON.stringify({ id }) });
        await loadAll();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function renderSales() {
  const list = $('sales-list');
  $('no-sales-message').classList.toggle('hidden', sales.length > 0);
  if (!sales.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = sales
    .map((sale) => {
      const when = new Date(sale.at).toLocaleString();
      const priceText =
        sale.totalPrice !== null && sale.totalPrice !== undefined ? ` — ৳${sale.totalPrice}` : '';
      return (
        `<div class="sale-row" data-id="${sale.id}">` +
        `<span>${escapeHtml(sale.shoeName)} — size ${escapeHtml(sale.size)}, ${sale.qty} pair(s)${priceText} — ${when}</span>` +
        `<button class="delete-sale-button" title="Delete this sale and restore the stock">×</button>` +
        `</div>`
      );
    })
    .join('');
  list.querySelectorAll('.sale-row').forEach((row) => {
    row.querySelector('.delete-sale-button').addEventListener('click', async () => {
      if (!confirm('Delete this sale? Its quantity will be added back to stock.')) return;
      try {
        await api('/api/sales', { method: 'DELETE', body: JSON.stringify({ id: row.dataset.id }) });
        await loadAll();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadAll() {
  const data = await api('/api/shoes');
  shoes = data.shoes || [];
  const salesData = await api('/api/sales');
  sales = salesData.sales || [];
  renderSummary();
  renderCards();
  renderSales();
}

// ---- Add / edit form ----

function addSizeRow(size = '', qty = '') {
  const row = document.createElement('div');
  row.className = 'size-row';
  row.innerHTML =
    `<input class="size-label" type="text" placeholder="Size (e.g. 41)" value="${escapeHtml(size)}" />` +
    `<input class="size-qty" type="number" min="0" step="1" placeholder="Pairs" value="${qty}" />` +
    `<button type="button" class="secondary remove-size-button">×</button>`;
  row.querySelector('.remove-size-button').addEventListener('click', () => row.remove());
  $('size-rows').appendChild(row);
}

function resetForm() {
  editingId = null;
  pendingPictureDataUrl = null;
  existingPictureUrl = null;
  $('form-title').textContent = 'Add shoe';
  $('shoe-name').value = '';
  $('shoe-price').value = '';
  $('shoe-colour').value = '';
  $('shoe-picture').value = '';
  $('picture-preview').classList.add('hidden');
  $('picture-preview').src = '';
  $('size-rows').innerHTML = '';
  addSizeRow();
  $('save-shoe-button').textContent = 'Add shoe';
  $('cancel-edit-button').classList.add('hidden');
  hideError($('form-error'));
}

function startEdit(id) {
  const shoe = shoes.find((s) => s.id === id);
  if (!shoe) return;
  editingId = id;
  pendingPictureDataUrl = null;
  existingPictureUrl = shoe.imageUrl || null;
  $('form-title').textContent = `Edit: ${shoe.name}`;
  $('shoe-name').value = shoe.name;
  $('shoe-price').value = shoe.price !== null && shoe.price !== undefined ? shoe.price : '';
  $('shoe-colour').value = shoe.colour || '';
  $('shoe-picture').value = '';
  if (existingPictureUrl) {
    $('picture-preview').src = existingPictureUrl;
    $('picture-preview').classList.remove('hidden');
  } else {
    $('picture-preview').classList.add('hidden');
  }
  $('size-rows').innerHTML = '';
  const entries = Object.entries(shoe.sizes || {});
  if (entries.length) entries.forEach(([size, qty]) => addSizeRow(size, qty));
  else addSizeRow();
  $('save-shoe-button').textContent = 'Save changes';
  $('cancel-edit-button').classList.remove('hidden');
  hideError($('form-error'));
  document.querySelector('.add-form').scrollIntoView({ behavior: 'smooth' });
}

function readSizesFromForm() {
  const sizes = {};
  let ok = true;
  document.querySelectorAll('#size-rows .size-row').forEach((row) => {
    const size = row.querySelector('.size-label').value.trim();
    const qty = Number(row.querySelector('.size-qty').value);
    if (!size) return; // skip blank rows
    if (!Number.isInteger(qty) || qty < 0) ok = false;
    else sizes[size] = qty;
  });
  if (!ok) throw new Error('Size quantities must be whole numbers of 0 or more.');
  if (!Object.keys(sizes).length) throw new Error('Add at least one size with a quantity.');
  return sizes;
}

// Compress a chosen picture in the browser (max 1200px, JPEG) so uploads
// stay small, then return a base64 data URL for /api/upload.
function compressPicture(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that picture.'));
    };
    img.src = url;
  });
}

async function saveShoe() {
  hideError($('form-error'));
  try {
    const name = $('shoe-name').value.trim();
    if (!name) throw new Error('Shoe name is required.');
    const priceRaw = $('shoe-price').value;
    let price = null;
    if (priceRaw !== '') {
      price = Number(priceRaw);
      if (!Number.isFinite(price) || price < 0) throw new Error('Price must be 0 or more.');
    }
    const colour = $('shoe-colour').value.trim() || null;
    const sizes = readSizesFromForm();

    let imageUrl = existingPictureUrl;
    if (pendingPictureDataUrl) {
      const uploaded = await api('/api/upload', {
        method: 'POST',
        body: JSON.stringify({ dataUrl: pendingPictureDataUrl }),
      });
      imageUrl = uploaded.url;
    }

    if (editingId) {
      await api('/api/shoes', {
        method: 'PUT',
        body: JSON.stringify({ id: editingId, name, price, colour, imageUrl, sizes }),
      });
    } else {
      await api('/api/shoes', {
        method: 'POST',
        body: JSON.stringify({ name, price, colour, imageUrl, sizes }),
      });
    }
    resetForm();
    await loadAll();
  } catch (err) {
    showError($('form-error'), err.message);
  }
}

// ---- Login and events ----

async function login() {
  hideError($('login-error'));
  const pw = $('password-input').value;
  if (!pw) {
    showError($('login-error'), 'Enter the password.');
    return;
  }
  sessionStorage.setItem('dm-password', pw);
  try {
    await loadAll();
    $('login-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
  } catch (err) {
    sessionStorage.removeItem('dm-password');
    showError($('login-error'), err.message);
  }
}

$('login-button').addEventListener('click', login);
$('password-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});
$('refresh-button').addEventListener('click', async () => {
  try {
    await loadAll();
  } catch (err) {
    alert(err.message);
  }
});
$('search-input').addEventListener('input', () => {
  renderSummary();
  renderCards();
});
$('add-size-button').addEventListener('click', () => addSizeRow());
$('save-shoe-button').addEventListener('click', saveShoe);
$('cancel-edit-button').addEventListener('click', resetForm);
$('shoe-picture').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    pendingPictureDataUrl = await compressPicture(file);
    $('picture-preview').src = pendingPictureDataUrl;
    $('picture-preview').classList.remove('hidden');
  } catch (err) {
    alert(err.message);
  }
});

resetForm();
