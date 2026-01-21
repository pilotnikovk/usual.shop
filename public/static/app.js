// ==============================================
// ARMATA-RAMPA FRONTEND APPLICATION
// ==============================================

// API Helper
const api = {
  async get(url) {
    const response = await fetch(url);
    return response.json();
  },
  async post(url, data) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }
};

// Format price
function formatPrice(price) {
  if (!price) return 'Цена по запросу';
  return price.toLocaleString('ru-RU') + ' ₽';
}

// ==============================================
// MODAL FUNCTIONS
// ==============================================

function openRequestModal() {
  const modal = document.getElementById('request-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeRequestModal() {
  const modal = document.getElementById('request-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function openProductRequestModal(productName) {
  const modal = document.getElementById('request-modal');
  const productNameEl = document.getElementById('modal-product-name');
  
  if (productNameEl) {
    productNameEl.textContent = 'Товар: ' + productName;
  }
  
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

// Close modal on outside click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('request-modal');
  if (e.target === modal) {
    closeRequestModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeRequestModal();
  }
});

// ==============================================
// FORM HANDLING
// ==============================================

async function submitForm(form, source = 'modal') {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  data.source = source;
  
  // Get UTM params from URL
  const urlParams = new URLSearchParams(window.location.search);
  data.utm_source = urlParams.get('utm_source') || '';
  data.utm_medium = urlParams.get('utm_medium') || '';
  data.utm_campaign = urlParams.get('utm_campaign') || '';
  
  try {
    const result = await api.post('/api/leads', data);
    
    if (result.success) {
      // Show success message
      form.innerHTML = `
        <div class="text-center py-8">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-check text-green-500 text-3xl"></i>
          </div>
          <h4 class="text-xl font-semibold mb-2">Спасибо за заявку!</h4>
          <p class="text-gray-600">Мы свяжемся с вами в ближайшее время</p>
        </div>
      `;
      
      // Track conversion in analytics
      if (typeof gtag !== 'undefined') {
        gtag('event', 'lead', { event_category: 'forms', event_label: source });
      }
      if (typeof ym !== 'undefined') {
        ym(window.yandexMetrikaId, 'reachGoal', 'lead');
      }
    } else {
      alert('Ошибка отправки. Пожалуйста, попробуйте позже или позвоните нам.');
    }
  } catch (error) {
    console.error('Form submission error:', error);
    alert('Ошибка отправки. Пожалуйста, попробуйте позже или позвоните нам.');
  }
}

// Attach form handlers
document.addEventListener('DOMContentLoaded', () => {
  // Main request form
  const mainForm = document.getElementById('main-request-form');
  if (mainForm) {
    mainForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitForm(mainForm, 'main-page');
    });
  }
  
  // Modal request form
  const modalForm = document.getElementById('modal-request-form');
  if (modalForm) {
    modalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitForm(modalForm, 'modal');
    });
  }
});

// ==============================================
// LOAD DATA
// ==============================================

// Load categories on homepage
async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  
  try {
    const result = await api.get('/api/categories');
    
    if (result.success && result.data) {
      grid.innerHTML = result.data.map(category => `
        <a href="/katalog/${category.slug}" class="group bg-white rounded-xl p-6 shadow-sm hover:shadow-lg transition">
          <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-orange-100 transition">
            <i class="fas fa-boxes text-2xl text-blue-900 group-hover:text-orange-500 transition"></i>
          </div>
          <h3 class="text-lg font-semibold mb-2 group-hover:text-orange-500 transition">${category.name}</h3>
          <p class="text-gray-600 text-sm">${category.description || ''}</p>
        </a>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Load featured products on homepage
async function loadFeaturedProducts() {
  const grid = document.getElementById('featured-products');
  if (!grid) return;
  
  try {
    const result = await api.get('/api/products');
    
    if (result.success && result.data) {
      // Show hit products first, then others
      const products = result.data
        .sort((a, b) => (b.is_hit || 0) - (a.is_hit || 0))
        .slice(0, 6);
      
      grid.innerHTML = products.map(product => `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-lg transition">
          <div class="relative aspect-[4/3] bg-gray-100 flex items-center justify-center">
            ${product.main_image 
              ? `<img src="${product.main_image}" alt="${product.name}" class="w-full h-full object-cover">`
              : `<i class="fas fa-image text-4xl text-gray-300"></i>`
            }
            ${product.is_hit ? '<span class="absolute top-3 left-3 bg-orange-500 text-white px-2 py-1 rounded text-xs font-medium">Хит продаж</span>' : ''}
            ${product.is_new ? '<span class="absolute top-3 left-3 bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">Новинка</span>' : ''}
          </div>
          <div class="p-4">
            <h3 class="font-semibold mb-2 group-hover:text-orange-500 transition">${product.name}</h3>
            <p class="text-gray-500 text-sm mb-3 line-clamp-2">${product.short_description || ''}</p>
            <div class="flex items-center justify-between">
              <span class="text-lg font-bold text-blue-900">${formatPrice(product.price)}</span>
              <a href="/product/${product.slug}" class="text-orange-500 hover:text-orange-600 font-medium text-sm">
                Подробнее <i class="fas fa-arrow-right ml-1"></i>
              </a>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

// Load products for catalog page
async function loadProducts(categorySlug = null) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  
  // Check if category is specified in data attribute
  if (!categorySlug && grid.dataset.category) {
    categorySlug = grid.dataset.category;
  }
  
  try {
    const url = categorySlug ? `/api/products?category=${categorySlug}` : '/api/products';
    const result = await api.get(url);
    
    if (result.success && result.data) {
      if (result.data.length === 0) {
        grid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">Товары не найдены</p>';
        return;
      }
      
      grid.innerHTML = result.data.map(product => `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-lg transition">
          <div class="relative aspect-[4/3] bg-gray-100 flex items-center justify-center">
            ${product.main_image 
              ? `<img src="${product.main_image}" alt="${product.name}" class="w-full h-full object-cover">`
              : `<i class="fas fa-image text-4xl text-gray-300"></i>`
            }
            ${product.is_hit ? '<span class="absolute top-3 left-3 bg-orange-500 text-white px-2 py-1 rounded text-xs font-medium">Хит продаж</span>' : ''}
          </div>
          <div class="p-4">
            <h3 class="font-semibold mb-2 group-hover:text-orange-500 transition">${product.name}</h3>
            <p class="text-gray-500 text-sm mb-3 line-clamp-2">${product.short_description || ''}</p>
            <div class="flex items-center justify-between mb-3">
              <span class="text-lg font-bold text-blue-900">${formatPrice(product.price)}</span>
              ${product.in_stock 
                ? '<span class="text-green-600 text-sm"><i class="fas fa-check-circle mr-1"></i>В наличии</span>'
                : '<span class="text-orange-500 text-sm"><i class="fas fa-clock mr-1"></i>Под заказ</span>'
              }
            </div>
            <div class="flex gap-2">
              <a href="/product/${product.slug}" class="flex-1 bg-blue-900 hover:bg-blue-800 text-white text-center py-2 rounded-lg text-sm font-medium transition">
                Подробнее
              </a>
              <button onclick="openProductRequestModal('${product.name}')" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading products:', error);
    grid.innerHTML = '<p class="text-red-500 col-span-full text-center py-8">Ошибка загрузки товаров</p>';
  }
}

// Load categories for filter sidebar
async function loadCategoryFilter() {
  const list = document.getElementById('category-filter');
  if (!list) return;
  
  try {
    const result = await api.get('/api/categories');
    
    if (result.success && result.data) {
      const currentPath = window.location.pathname;
      
      list.innerHTML = `
        <li>
          <a href="/katalog" class="${currentPath === '/katalog' ? 'text-orange-500 font-medium' : 'text-gray-600 hover:text-blue-900'}">
            Все товары
          </a>
        </li>
        ${result.data.map(category => `
          <li>
            <a href="/katalog/${category.slug}" class="${currentPath === '/katalog/' + category.slug ? 'text-orange-500 font-medium' : 'text-gray-600 hover:text-blue-900'}">
              ${category.name}
            </a>
          </li>
        `).join('')}
      `;
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Load reviews
async function loadReviews() {
  const slider = document.getElementById('reviews-slider');
  if (!slider) return;
  
  try {
    const result = await api.get('/api/reviews');
    
    if (result.success && result.data) {
      slider.innerHTML = result.data.slice(0, 3).map(review => `
        <div class="bg-white rounded-xl p-6 shadow-sm">
          <div class="flex items-center mb-4">
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
              ${review.client_photo 
                ? `<img src="${review.client_photo}" alt="${review.client_name}" class="w-full h-full rounded-full object-cover">`
                : `<i class="fas fa-user text-blue-500"></i>`
              }
            </div>
            <div>
              <h4 class="font-semibold">${review.client_name}</h4>
              <p class="text-gray-500 text-sm">${review.client_company || ''}</p>
            </div>
          </div>
          <div class="flex mb-3">
            ${Array(review.rating || 5).fill('<i class="fas fa-star text-orange-400"></i>').join('')}
          </div>
          <p class="text-gray-600">${review.review_text}</p>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading reviews:', error);
  }
}

// ==============================================
// INITIALIZE
// ==============================================

document.addEventListener('DOMContentLoaded', () => {
  // Load data based on current page
  const path = window.location.pathname;
  
  if (path === '/') {
    // Homepage
    loadCategories();
    loadFeaturedProducts();
    loadReviews();
  } else if (path === '/katalog' || path.startsWith('/katalog/')) {
    // Catalog pages
    loadCategoryFilter();
    loadProducts();
  }
});

// Phone mask (simple)
document.addEventListener('input', (e) => {
  if (e.target.type === 'tel') {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 0) {
      if (value[0] === '8') value = '7' + value.slice(1);
      if (value[0] !== '7') value = '7' + value;
      
      let formatted = '+7';
      if (value.length > 1) formatted += ' (' + value.slice(1, 4);
      if (value.length > 4) formatted += ') ' + value.slice(4, 7);
      if (value.length > 7) formatted += '-' + value.slice(7, 9);
      if (value.length > 9) formatted += '-' + value.slice(9, 11);
      
      e.target.value = formatted;
    }
  }
});
