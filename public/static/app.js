/**
 * Armata-Rampa 2026 - Modern Interactive Frontend
 * Glassmorphism + Animations + Smooth UX
 */

// ============================================
// UTILITY FUNCTIONS
// ============================================

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const formatPrice = (price) => {
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
};

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

// ============================================
// INTERSECTION OBSERVER FOR ANIMATIONS
// ============================================

const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const fadeInObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      fadeInObserver.unobserve(entry.target);
    }
  });
}, observerOptions);

// Initialize animations for elements
document.querySelectorAll('.animate-on-scroll').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  fadeInObserver.observe(el);
});

// ============================================
// HEADER SCROLL EFFECT
// ============================================

const header = document.querySelector('header');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  
  if (header) {
    if (currentScroll > 100) {
      header.style.background = 'rgba(255, 255, 255, 0.95)';
      header.style.backdropFilter = 'blur(20px)';
      header.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.1)';
    } else {
      header.style.background = 'rgba(255, 255, 255, 0.8)';
      header.style.backdropFilter = 'blur(10px)';
      header.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.05)';
    }
  }
  
  lastScroll = currentScroll;
});

// ============================================
// MOBILE MENU
// ============================================

const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');

if (mobileMenuBtn && mobileMenu) {
  mobileMenuBtn.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
    mobileMenuBtn.querySelector('i').classList.toggle('fa-bars');
    mobileMenuBtn.querySelector('i').classList.toggle('fa-times');
  });
}

// ============================================
// COUNTER ANIMATION
// ============================================

const animateCounter = (element, target, duration = 2000) => {
  let start = 0;
  const step = (timestamp) => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const current = Math.floor(progress * target);
    element.textContent = current.toLocaleString('ru-RU');
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      element.textContent = target.toLocaleString('ru-RU');
    }
  };
  window.requestAnimationFrame(step);
};

// Observe counters
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const target = parseInt(entry.target.dataset.count);
      animateCounter(entry.target, target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('[data-count]').forEach(el => {
  counterObserver.observe(el);
});

// ============================================
// SMOOTH SCROLL
// ============================================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// ============================================
// CATEGORIES LOADING
// ============================================

const loadCategories = async () => {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;

  try {
    const response = await fetch('/api/categories');
    const data = await response.json();

    if (data.success && data.data) {
      const categoryIcons = {
        'mobilnye-rampy': 'fa-truck-loading',
        'gidravlicheskie-rampy': 'fa-cogs',
        'estakady': 'fa-road',
        'kontejnernye-rampy': 'fa-box'
      };

      const categoryGradients = {
        'mobilnye-rampy': 'from-blue-500 to-cyan-500',
        'gidravlicheskie-rampy': 'from-purple-500 to-pink-500',
        'estakady': 'from-orange-500 to-amber-500',
        'kontejnernye-rampy': 'from-green-500 to-emerald-500'
      };

      grid.innerHTML = data.data.map(cat => `
        <a href="/katalog/${cat.slug}" 
           class="group relative overflow-hidden rounded-3xl p-8 transition-all duration-500 hover:scale-105 hover:shadow-2xl"
           style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1)); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
          <div class="absolute inset-0 bg-gradient-to-br ${categoryGradients[cat.slug] || 'from-blue-500 to-purple-500'} opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div class="relative z-10">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              <i class="fas ${categoryIcons[cat.slug] || 'fa-cubes'} text-2xl text-white"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 group-hover:text-white transition-colors mb-2">${cat.name}</h3>
            <p class="text-gray-600 group-hover:text-white/80 transition-colors text-sm">${cat.description || ''}</p>
            <div class="mt-4 flex items-center text-blue-600 group-hover:text-white transition-colors">
              <span class="text-sm font-semibold">Смотреть каталог</span>
              <i class="fas fa-arrow-right ml-2 group-hover:translate-x-2 transition-transform"></i>
            </div>
          </div>
        </a>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading categories:', error);
    grid.innerHTML = '<p class="text-center text-gray-500 col-span-full">Ошибка загрузки категорий</p>';
  }
};

// ============================================
// FEATURED PRODUCTS LOADING
// ============================================

const loadFeaturedProducts = async () => {
  const container = document.getElementById('featured-products');
  if (!container) return;

  try {
    const response = await fetch('/api/products?featured=1&limit=4');
    const data = await response.json();

    if (data.success && data.data) {
      container.innerHTML = data.data.map((product, index) => `
        <div class="group product-card" style="animation-delay: ${index * 100}ms">
          <div class="relative overflow-hidden rounded-3xl bg-white shadow-lg hover:shadow-2xl transition-all duration-500">
            ${product.is_hit ? `
              <div class="absolute top-4 left-4 z-20">
                <span class="px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-bold rounded-full shadow-lg animate-pulse">
                  🔥 ХИТ ПРОДАЖ
                </span>
              </div>
            ` : ''}
            ${product.is_new ? `
              <div class="absolute top-4 right-4 z-20">
                <span class="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold rounded-full shadow-lg">
                  ✨ НОВИНКА
                </span>
              </div>
            ` : ''}
            
            <div class="aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
              <img src="${product.main_image || '/images/placeholder.jpg'}" 
                   alt="${product.name}"
                   class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                   onerror="this.src='https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=400&fit=crop'">
            </div>
            
            <div class="p-6">
              <div class="flex items-center gap-2 mb-3">
                <span class="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                  ${product.category_name || 'Рампы'}
                </span>
                ${product.in_stock ? `
                  <span class="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                    ✓ В наличии
                  </span>
                ` : `
                  <span class="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                    Под заказ
                  </span>
                `}
              </div>
              
              <h3 class="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                <a href="/product/${product.slug}">${product.name}</a>
              </h3>
              
              <p class="text-gray-600 text-sm mb-4 line-clamp-2">${product.short_description || ''}</p>
              
              <div class="flex flex-wrap gap-2 mb-4">
                ${product.load_capacity ? `
                  <span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg">
                    <i class="fas fa-weight-hanging mr-1"></i>${product.load_capacity} т
                  </span>
                ` : ''}
                ${product.total_length ? `
                  <span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg">
                    <i class="fas fa-ruler mr-1"></i>${product.total_length} м
                  </span>
                ` : ''}
              </div>
              
              <div class="flex items-center justify-between pt-4 border-t border-gray-100">
                <div>
                  <span class="text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    ${formatPrice(product.price)}
                  </span>
                  <span class="block text-xs text-gray-500">с НДС 20%</span>
                </div>
                <a href="/product/${product.slug}" 
                   class="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg hover:scale-105 transition-all duration-300">
                  Подробнее
                </a>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading products:', error);
    container.innerHTML = '<p class="text-center text-gray-500 col-span-full">Ошибка загрузки товаров</p>';
  }
};

// ============================================
// REVIEWS/TESTIMONIALS
// ============================================

const loadReviews = async () => {
  const container = document.getElementById('reviews-container');
  if (!container) return;

  try {
    const response = await fetch('/api/reviews?limit=3');
    const data = await response.json();

    if (data.success && data.data) {
      container.innerHTML = data.data.map(review => `
        <div class="glass-card rounded-3xl p-8 hover:scale-105 transition-all duration-300">
          <div class="flex items-center gap-4 mb-6">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
              ${review.author_name.charAt(0)}
            </div>
            <div>
              <h4 class="font-bold text-gray-900">${review.author_name}</h4>
              <p class="text-gray-500 text-sm">${review.company_name || ''}</p>
            </div>
          </div>
          <div class="flex gap-1 mb-4">
            ${[1,2,3,4,5].map(i => `
              <i class="fas fa-star ${i <= review.rating ? 'text-yellow-400' : 'text-gray-300'}"></i>
            `).join('')}
          </div>
          <p class="text-gray-600 leading-relaxed">${review.content}</p>
          <p class="mt-4 text-sm text-gray-400">${formatDate(review.created_at)}</p>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading reviews:', error);
  }
};

// ============================================
// FAQ ACCORDION
// ============================================

const loadFAQ = async () => {
  const container = document.getElementById('faq-container');
  if (!container) return;

  try {
    const response = await fetch('/api/faq?limit=5');
    const data = await response.json();

    if (data.success && data.data) {
      container.innerHTML = data.data.map((item, index) => `
        <div class="faq-item glass-card rounded-2xl overflow-hidden mb-4">
          <button class="w-full p-6 text-left flex items-center justify-between gap-4 hover:bg-white/50 transition-colors"
                  onclick="toggleFAQ(this)">
            <span class="font-semibold text-gray-900">${item.question}</span>
            <i class="fas fa-chevron-down text-blue-600 transition-transform duration-300"></i>
          </button>
          <div class="faq-answer hidden px-6 pb-6">
            <p class="text-gray-600 leading-relaxed">${item.answer}</p>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading FAQ:', error);
  }
};

window.toggleFAQ = (button) => {
  const item = button.closest('.faq-item');
  const answer = item.querySelector('.faq-answer');
  const icon = button.querySelector('i');
  
  answer.classList.toggle('hidden');
  icon.classList.toggle('rotate-180');
};

// ============================================
// CONTACT FORM
// ============================================

const initContactForm = () => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Отправка...';
    submitBtn.disabled = true;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Add UTM parameters
    const urlParams = new URLSearchParams(window.location.search);
    data.utm_source = urlParams.get('utm_source') || '';
    data.utm_medium = urlParams.get('utm_medium') || '';
    data.utm_campaign = urlParams.get('utm_campaign') || '';

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        showNotification('Заявка успешно отправлена! Мы свяжемся с вами в ближайшее время.', 'success');
        form.reset();
        
        // Track conversion
        if (typeof gtag === 'function') {
          gtag('event', 'conversion', { 'event_category': 'lead' });
        }
        if (typeof ym === 'function') {
          ym(12345678, 'reachGoal', 'lead_submit');
        }
      } else {
        showNotification('Произошла ошибка. Попробуйте еще раз.', 'error');
      }
    } catch (error) {
      showNotification('Ошибка сети. Проверьте подключение к интернету.', 'error');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });
};

// ============================================
// NOTIFICATIONS
// ============================================

window.showNotification = (message, type = 'info') => {
  const colors = {
    success: 'from-green-500 to-emerald-500',
    error: 'from-red-500 to-pink-500',
    info: 'from-blue-500 to-purple-500'
  };

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };

  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 z-50 p-4 rounded-2xl text-white shadow-2xl transform translate-x-full transition-transform duration-500 bg-gradient-to-r ${colors[type]}`;
  notification.innerHTML = `
    <div class="flex items-center gap-3">
      <i class="fas ${icons[type]} text-xl"></i>
      <span class="font-medium">${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-4 hover:opacity-70">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  document.body.appendChild(notification);
  
  setTimeout(() => notification.style.transform = 'translateX(0)', 10);
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => notification.remove(), 500);
  }, 5000);
};

// ============================================
// CATALOG PAGE FUNCTIONALITY
// ============================================

const initCatalogPage = () => {
  const productGrid = document.getElementById('product-grid');
  if (!productGrid) return;

  let currentFilters = {
    category: '',
    minPrice: '',
    maxPrice: '',
    sort: 'popular'
  };

  const loadProducts = async () => {
    productGrid.innerHTML = `
      <div class="col-span-full flex justify-center py-12">
        <i class="fas fa-spinner fa-spin text-4xl text-blue-600"></i>
      </div>
    `;

    const params = new URLSearchParams();
    if (currentFilters.category) params.set('category', currentFilters.category);
    if (currentFilters.minPrice) params.set('min_price', currentFilters.minPrice);
    if (currentFilters.maxPrice) params.set('max_price', currentFilters.maxPrice);
    if (currentFilters.sort) params.set('sort', currentFilters.sort);

    try {
      const response = await fetch(`/api/products?${params}`);
      const data = await response.json();

      if (data.success && data.data.length > 0) {
        productGrid.innerHTML = data.data.map(product => createProductCard(product)).join('');
      } else {
        productGrid.innerHTML = `
          <div class="col-span-full text-center py-12">
            <i class="fas fa-search text-6xl text-gray-300 mb-4"></i>
            <p class="text-gray-500 text-xl">Товары не найдены</p>
            <p class="text-gray-400 mt-2">Попробуйте изменить фильтры</p>
          </div>
        `;
      }
    } catch (error) {
      productGrid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <i class="fas fa-exclamation-triangle text-6xl text-red-300 mb-4"></i>
          <p class="text-gray-500 text-xl">Ошибка загрузки</p>
        </div>
      `;
    }
  };

  // Filter handlers
  document.querySelectorAll('[data-filter]').forEach(el => {
    el.addEventListener('change', (e) => {
      currentFilters[e.target.dataset.filter] = e.target.value;
      loadProducts();
    });
  });

  loadProducts();
};

const createProductCard = (product) => `
  <div class="group product-card">
    <div class="relative overflow-hidden rounded-3xl bg-white shadow-lg hover:shadow-2xl transition-all duration-500">
      ${product.is_hit ? `
        <div class="absolute top-4 left-4 z-20">
          <span class="px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-bold rounded-full shadow-lg animate-pulse">
            🔥 ХИТ
          </span>
        </div>
      ` : ''}
      
      <div class="aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
        <img src="${product.main_image || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=400&fit=crop'}" 
             alt="${product.name}"
             class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
             loading="lazy">
      </div>
      
      <div class="p-6">
        <span class="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full mb-3">
          ${product.category_name || 'Рампы'}
        </span>
        
        <h3 class="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
          <a href="/product/${product.slug}">${product.name}</a>
        </h3>
        
        <div class="flex flex-wrap gap-2 mb-4 text-xs text-gray-500">
          ${product.load_capacity ? `<span><i class="fas fa-weight-hanging mr-1"></i>${product.load_capacity} т</span>` : ''}
          ${product.total_length ? `<span><i class="fas fa-ruler mr-1"></i>${product.total_length} м</span>` : ''}
        </div>
        
        <div class="flex items-center justify-between pt-4 border-t border-gray-100">
          <span class="text-2xl font-black text-blue-600">${formatPrice(product.price)}</span>
          <a href="/product/${product.slug}" 
             class="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all">
            Подробнее
          </a>
        </div>
      </div>
    </div>
  </div>
`;

// ============================================
// PRODUCT PAGE FUNCTIONALITY
// ============================================

const initProductPage = () => {
  const gallery = document.getElementById('product-gallery');
  if (!gallery) return;

  // Image gallery
  const thumbnails = gallery.querySelectorAll('.thumbnail');
  const mainImage = gallery.querySelector('.main-image');

  thumbnails.forEach(thumb => {
    thumb.addEventListener('click', () => {
      mainImage.src = thumb.dataset.src;
      thumbnails.forEach(t => t.classList.remove('ring-2', 'ring-blue-500'));
      thumb.classList.add('ring-2', 'ring-blue-500');
    });
  });

  // Quick order form
  const quickOrderBtn = document.getElementById('quickOrderBtn');
  if (quickOrderBtn) {
    quickOrderBtn.addEventListener('click', () => {
      document.getElementById('quickOrderModal').classList.remove('hidden');
    });
  }
};

// ============================================
// ADMIN PANEL FUNCTIONALITY
// ============================================

const initAdminPanel = () => {
  const adminSection = document.querySelector('[data-admin]');
  if (!adminSection) return;

  // Check authentication
  const token = localStorage.getItem('adminToken');
  if (!token && !window.location.pathname.includes('/admin/login')) {
    window.location.href = '/admin/login';
    return;
  }

  // Load dashboard stats
  const loadDashboardStats = async () => {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (data.success) {
        document.getElementById('totalProducts').textContent = data.stats.totalProducts;
        document.getElementById('totalLeads').textContent = data.stats.totalLeads;
        document.getElementById('newLeads').textContent = data.stats.newLeads;
        document.getElementById('totalViews').textContent = data.stats.totalViews;
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  if (document.getElementById('totalProducts')) {
    loadDashboardStats();
  }
};

// Admin login
window.adminLogin = async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password')
      })
    });

    const data = await response.json();

    if (data.success) {
      localStorage.setItem('adminToken', data.token);
      window.location.href = '/admin';
    } else {
      showNotification(data.error || 'Ошибка авторизации', 'error');
    }
  } catch (error) {
    showNotification('Ошибка сети', 'error');
  }
};

// Admin logout
window.adminLogout = () => {
  localStorage.removeItem('adminToken');
  window.location.href = '/admin/login';
};

// ============================================
// PARALLAX EFFECT
// ============================================

const initParallax = () => {
  const parallaxElements = document.querySelectorAll('[data-parallax]');
  
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    
    parallaxElements.forEach(el => {
      const speed = parseFloat(el.dataset.parallax) || 0.5;
      const yPos = -(scrolled * speed);
      el.style.transform = `translateY(${yPos}px)`;
    });
  });
};

// ============================================
// BACK TO TOP BUTTON
// ============================================

const initBackToTop = () => {
  const btn = document.getElementById('backToTop');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 500) {
      btn.classList.remove('opacity-0', 'pointer-events-none');
      btn.classList.add('opacity-100');
    } else {
      btn.classList.add('opacity-0', 'pointer-events-none');
      btn.classList.remove('opacity-100');
    }
  });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
};

// ============================================
// LAZY LOADING IMAGES
// ============================================

const initLazyLoading = () => {
  const images = document.querySelectorAll('img[data-src]');
  
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        imageObserver.unobserve(img);
      }
    });
  });

  images.forEach(img => imageObserver.observe(img));
};

// ============================================
// INITIALIZE ALL
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Load dynamic content
  loadCategories();
  loadFeaturedProducts();
  loadReviews();
  loadFAQ();

  // Initialize features
  initContactForm();
  initCatalogPage();
  initProductPage();
  initAdminPanel();
  initParallax();
  initBackToTop();
  initLazyLoading();

  // Add scroll animations
  document.querySelectorAll('section').forEach((section, index) => {
    section.style.animationDelay = `${index * 100}ms`;
  });

  console.log('🚀 Armata-Rampa 2026 - Loaded successfully');
});

// ============================================
// SERVICE WORKER REGISTRATION (PWA)
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker not available
    });
  });
}
