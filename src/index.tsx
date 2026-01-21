import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-pages'

// Types
type Bindings = {
  DB: D1Database
}

type Variables = {
  settings: Record<string, string>
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Middleware
app.use('/api/*', cors())

// Load settings middleware
app.use('*', async (c, next) => {
  try {
    const result = await c.env.DB.prepare('SELECT key, value FROM settings').all()
    const settings: Record<string, string> = {}
    result.results?.forEach((row: any) => {
      settings[row.key] = row.value
    })
    c.set('settings', settings)
  } catch (e) {
    c.set('settings', {})
  }
  await next()
})

// ==========================================
// API ROUTES
// ==========================================

// Get all categories
app.get('/api/categories', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order'
    ).all()
    return c.json({ success: true, data: result.results })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch categories' }, 500)
  }
})

// Get products by category
app.get('/api/products', async (c) => {
  try {
    const categorySlug = c.req.query('category')
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_active = 1
    `
    if (categorySlug) {
      query += ` AND c.slug = '${categorySlug}'`
    }
    query += ' ORDER BY p.sort_order'
    
    const result = await c.env.DB.prepare(query).all()
    return c.json({ success: true, data: result.results })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch products' }, 500)
  }
})

// Get single product
app.get('/api/products/:slug', async (c) => {
  try {
    const slug = c.req.param('slug')
    const result = await c.env.DB.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.slug = ? AND p.is_active = 1
    `).bind(slug).first()
    
    if (!result) {
      return c.json({ success: false, error: 'Product not found' }, 404)
    }
    
    // Increment views
    await c.env.DB.prepare('UPDATE products SET views_count = views_count + 1 WHERE slug = ?').bind(slug).run()
    
    return c.json({ success: true, data: result })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch product' }, 500)
  }
})

// Get reviews
app.get('/api/reviews', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM reviews WHERE is_active = 1 AND is_approved = 1 ORDER BY created_at DESC'
    ).all()
    return c.json({ success: true, data: result.results })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch reviews' }, 500)
  }
})

// Get FAQ
app.get('/api/faq', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM faq WHERE is_active = 1 ORDER BY sort_order'
    ).all()
    return c.json({ success: true, data: result.results })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch FAQ' }, 500)
  }
})

// Get portfolio
app.get('/api/portfolio', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM portfolio WHERE is_active = 1 ORDER BY sort_order'
    ).all()
    return c.json({ success: true, data: result.results })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch portfolio' }, 500)
  }
})

// Get page by slug
app.get('/api/pages/:slug', async (c) => {
  try {
    const slug = c.req.param('slug')
    const result = await c.env.DB.prepare(
      'SELECT * FROM pages WHERE slug = ? AND is_active = 1'
    ).bind(slug).first()
    
    if (!result) {
      return c.json({ success: false, error: 'Page not found' }, 404)
    }
    return c.json({ success: true, data: result })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch page' }, 500)
  }
})

// Get settings
app.get('/api/settings', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT key, value FROM settings').all()
    const settings: Record<string, string> = {}
    result.results?.forEach((row: any) => {
      settings[row.key] = row.value
    })
    return c.json({ success: true, data: settings })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch settings' }, 500)
  }
})

// Submit lead/request
app.post('/api/leads', async (c) => {
  try {
    const body = await c.req.json()
    const { name, phone, email, company, message, product_id, source } = body
    
    if (!name || !phone) {
      return c.json({ success: false, error: 'Name and phone are required' }, 400)
    }
    
    // Get UTM params from query
    const url = new URL(c.req.url)
    const utm_source = url.searchParams.get('utm_source') || ''
    const utm_medium = url.searchParams.get('utm_medium') || ''
    const utm_campaign = url.searchParams.get('utm_campaign') || ''
    
    await c.env.DB.prepare(`
      INSERT INTO leads (name, phone, email, company, message, product_id, source, utm_source, utm_medium, utm_campaign)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(name, phone, email || '', company || '', message || '', product_id || null, source || 'website', utm_source, utm_medium, utm_campaign).run()
    
    return c.json({ success: true, message: 'Request submitted successfully' })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to submit request' }, 500)
  }
})

// ==========================================
// ADMIN API ROUTES
// ==========================================

// Admin: Get all leads
app.get('/api/admin/leads', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT l.*, p.name as product_name 
      FROM leads l 
      LEFT JOIN products p ON l.product_id = p.id 
      ORDER BY l.created_at DESC
    `).all()
    return c.json({ success: true, data: result.results })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch leads' }, 500)
  }
})

// Admin: Update lead status
app.put('/api/admin/leads/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { status, notes } = await c.req.json()
    
    await c.env.DB.prepare(`
      UPDATE leads SET status = ?, notes = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(status, notes || '', id).run()
    
    return c.json({ success: true })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to update lead' }, 500)
  }
})

// Admin: Get all products (including inactive)
app.get('/api/admin/products', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      ORDER BY p.sort_order
    `).all()
    return c.json({ success: true, data: result.results })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch products' }, 500)
  }
})

// Admin: Create product
app.post('/api/admin/products', async (c) => {
  try {
    const body = await c.req.json()
    const { 
      category_id, slug, name, short_description, full_description,
      price, old_price, in_stock, is_hit, is_new, is_sale,
      specifications, seo_title, seo_description, seo_keywords,
      images, main_image, sort_order, is_active
    } = body
    
    const result = await c.env.DB.prepare(`
      INSERT INTO products (category_id, slug, name, short_description, full_description, price, old_price, in_stock, is_hit, is_new, is_sale, specifications, seo_title, seo_description, seo_keywords, images, main_image, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      category_id, slug, name, short_description || '', full_description || '',
      price, old_price || null, in_stock ? 1 : 0, is_hit ? 1 : 0, is_new ? 1 : 0, is_sale ? 1 : 0,
      JSON.stringify(specifications || {}), seo_title || '', seo_description || '', seo_keywords || '',
      JSON.stringify(images || []), main_image || '', sort_order || 0, is_active ? 1 : 0
    ).run()
    
    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (e: any) {
    return c.json({ success: false, error: e.message || 'Failed to create product' }, 500)
  }
})

// Admin: Update product
app.put('/api/admin/products/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { 
      category_id, slug, name, short_description, full_description,
      price, old_price, in_stock, is_hit, is_new, is_sale,
      specifications, seo_title, seo_description, seo_keywords,
      images, main_image, sort_order, is_active
    } = body
    
    await c.env.DB.prepare(`
      UPDATE products SET 
        category_id = ?, slug = ?, name = ?, short_description = ?, full_description = ?,
        price = ?, old_price = ?, in_stock = ?, is_hit = ?, is_new = ?, is_sale = ?,
        specifications = ?, seo_title = ?, seo_description = ?, seo_keywords = ?,
        images = ?, main_image = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      category_id, slug, name, short_description || '', full_description || '',
      price, old_price || null, in_stock ? 1 : 0, is_hit ? 1 : 0, is_new ? 1 : 0, is_sale ? 1 : 0,
      JSON.stringify(specifications || {}), seo_title || '', seo_description || '', seo_keywords || '',
      JSON.stringify(images || []), main_image || '', sort_order || 0, is_active ? 1 : 0, id
    ).run()
    
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message || 'Failed to update product' }, 500)
  }
})

// Admin: Delete product
app.delete('/api/admin/products/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to delete product' }, 500)
  }
})

// Admin: Update settings
app.put('/api/admin/settings', async (c) => {
  try {
    const settings = await c.req.json()
    
    for (const [key, value] of Object.entries(settings)) {
      await c.env.DB.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      `).bind(key, value).run()
    }
    
    return c.json({ success: true })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to update settings' }, 500)
  }
})

// ==========================================
// STATIC FILES & PAGES
// ==========================================

// Serve static files
app.use('/static/*', serveStatic())
app.use('/images/*', serveStatic())

// Helper: Render HTML template
const renderPage = (title: string, content: string, seoTitle?: string, seoDescription?: string) => {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${seoTitle || title} | Armata-Rampa</title>
  <meta name="description" content="${seoDescription || 'Производитель погрузочных рамп и эстакад. Собственное производство, гарантия качества, доставка по России.'}">
  <meta name="keywords" content="рампа погрузочная, гидравлическая рампа, эстакада складская, мобильная рампа, купить рампу">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${seoTitle || title}">
  <meta property="og:description" content="${seoDescription || 'Производитель погрузочных рамп и эстакад'}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  
  <!-- Styles -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/styles.css" rel="stylesheet">
  
  <!-- Schema.org -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Armata-Rampa",
    "description": "Производитель погрузочных рамп и эстакад",
    "url": "https://armata-rampa.ru",
    "logo": "https://armata-rampa.ru/images/logo.png",
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+7-495-555-35-35",
      "contactType": "sales"
    }
  }
  </script>
</head>
<body class="bg-gray-50 font-sans antialiased">
  ${content}
  
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`
}

// Main page
app.get('/', async (c) => {
  const settings = c.get('settings')
  
  const content = `
  <!-- Header -->
  <header class="bg-white shadow-sm sticky top-0 z-50">
    <div class="bg-blue-900 text-white py-2">
      <div class="container mx-auto px-4 flex justify-between items-center text-sm">
        <div class="flex items-center space-x-4">
          <span><i class="fas fa-map-marker-alt mr-1"></i> ${settings.address || 'г. Владимир'}</span>
          <span><i class="fas fa-clock mr-1"></i> ${settings.working_hours || 'Пн-Пт: 9:00-18:00'}</span>
        </div>
        <div class="flex items-center space-x-4">
          <a href="mailto:${settings.email || 'info@armata-rampa.ru'}" class="hover:text-orange-400">
            <i class="fas fa-envelope mr-1"></i> ${settings.email || 'info@armata-rampa.ru'}
          </a>
        </div>
      </div>
    </div>
    
    <nav class="container mx-auto px-4 py-4">
      <div class="flex justify-between items-center">
        <a href="/" class="flex items-center">
          <span class="text-2xl font-bold text-blue-900">ARMATA</span>
          <span class="text-2xl font-bold text-orange-500">-RAMPA</span>
        </a>
        
        <div class="hidden md:flex items-center space-x-6">
          <a href="/katalog" class="text-gray-700 hover:text-blue-900 font-medium">Каталог продукции</a>
          <a href="/o-kompanii" class="text-gray-700 hover:text-blue-900 font-medium">О компании</a>
          <a href="/portfolio" class="text-gray-700 hover:text-blue-900 font-medium">Портфолио</a>
          <a href="/dostavka" class="text-gray-700 hover:text-blue-900 font-medium">Доставка</a>
          <a href="/kontakty" class="text-gray-700 hover:text-blue-900 font-medium">Контакты</a>
        </div>
        
        <div class="flex items-center space-x-4">
          <a href="tel:${(settings.phone_main || '+74955553535').replace(/[^+\d]/g, '')}" class="hidden lg:flex items-center text-blue-900 font-bold text-lg">
            <i class="fas fa-phone mr-2"></i>
            ${settings.phone_main || '+7 (495) 555-35-35'}
          </a>
          <button onclick="openRequestModal()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition">
            Оставить заявку
          </button>
        </div>
      </div>
    </nav>
  </header>

  <!-- Hero Section -->
  <section class="relative bg-gradient-to-r from-blue-900 to-blue-700 text-white py-20">
    <div class="absolute inset-0 bg-black/20"></div>
    <div class="container mx-auto px-4 relative z-10">
      <div class="max-w-3xl">
        <h1 class="text-4xl md:text-5xl font-bold mb-6">
          Погрузочные рампы и эстакады
          <span class="text-orange-400">от производителя</span>
        </h1>
        <p class="text-xl mb-8 text-blue-100">
          Собственное производство. Гарантия 1 год. Доставка по всей России.
        </p>
        <div class="flex flex-wrap gap-4 mb-8">
          <div class="flex items-center bg-white/10 backdrop-blur px-4 py-2 rounded-lg">
            <i class="fas fa-truck text-orange-400 mr-2"></i>
            <span>Доставка по России</span>
          </div>
          <div class="flex items-center bg-white/10 backdrop-blur px-4 py-2 rounded-lg">
            <i class="fas fa-cut text-orange-400 mr-2"></i>
            <span>Резка по параметрам</span>
          </div>
          <div class="flex items-center bg-white/10 backdrop-blur px-4 py-2 rounded-lg">
            <i class="fas fa-boxes text-orange-400 mr-2"></i>
            <span>Комплектация материалов</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-4">
          <a href="/katalog" class="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition text-lg">
            Перейти в каталог
          </a>
          <button onclick="openRequestModal()" class="bg-white/20 hover:bg-white/30 backdrop-blur text-white px-8 py-3 rounded-lg font-semibold transition text-lg border border-white/30">
            Получить консультацию
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- Products Section -->
  <section class="py-16 bg-white">
    <div class="container mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-4">Наша продукция</h2>
      <p class="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
        Производим погрузочные рампы и эстакады любой сложности. Вся продукция сертифицирована.
      </p>
      
      <div id="categories-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Categories loaded via JS -->
      </div>
      
      <div class="text-center mt-10">
        <a href="/katalog" class="inline-flex items-center bg-blue-900 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition">
          Смотреть весь каталог
          <i class="fas fa-arrow-right ml-2"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- Featured Products -->
  <section class="py-16 bg-gray-50">
    <div class="container mx-auto px-4">
      <div class="flex justify-between items-center mb-10">
        <div>
          <h2 class="text-3xl font-bold">Акционные предложения</h2>
          <p class="text-gray-600 mt-2">Лучшие цены на популярные модели</p>
        </div>
      </div>
      
      <div id="featured-products" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Products loaded via JS -->
      </div>
      
      <div class="text-center mt-10">
        <a href="/katalog" class="inline-flex items-center text-blue-900 hover:text-orange-500 font-semibold transition">
          Все предложения
          <i class="fas fa-arrow-right ml-2"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- Services Section -->
  <section class="py-16 bg-white">
    <div class="container mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-12">Наши услуги</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="text-center p-6 rounded-xl bg-gray-50 hover:shadow-lg transition">
          <div class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-truck text-2xl text-orange-500"></i>
          </div>
          <h3 class="text-xl font-semibold mb-2">Доставка</h3>
          <p class="text-gray-600">Доставляем рампы и эстакады по всей России. Выгодные условия для регионов ЦФО и ПФО.</p>
        </div>
        
        <div class="text-center p-6 rounded-xl bg-gray-50 hover:shadow-lg transition">
          <div class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-cogs text-2xl text-orange-500"></i>
          </div>
          <h3 class="text-xl font-semibold mb-2">Монтаж</h3>
          <p class="text-gray-600">Профессиональный монтаж и установка оборудования. Гарантия на работы.</p>
        </div>
        
        <div class="text-center p-6 rounded-xl bg-gray-50 hover:shadow-lg transition">
          <div class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-tools text-2xl text-orange-500"></i>
          </div>
          <h3 class="text-xl font-semibold mb-2">Сервис</h3>
          <p class="text-gray-600">Техническое обслуживание и ремонт. Поставка запасных частей.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Reviews Section -->
  <section class="py-16 bg-gray-50">
    <div class="container mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-12">Отзывы о сотрудничестве</h2>
      
      <div id="reviews-slider" class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Reviews loaded via JS -->
      </div>
      
      <div class="text-center mt-8">
        <a href="#" class="text-orange-500 hover:text-orange-600 font-semibold">
          Все отзывы <i class="fas fa-arrow-right ml-1"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section class="py-16 bg-blue-900 text-white">
    <div class="container mx-auto px-4">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl font-bold mb-4">Оставьте заявку</h2>
          <p class="text-blue-200 mb-6">
            И наши специалисты свяжутся с Вами для консультации и расчета стоимости
          </p>
          <ul class="space-y-3 text-blue-100">
            <li><i class="fas fa-check text-orange-400 mr-2"></i> Бесплатная консультация</li>
            <li><i class="fas fa-check text-orange-400 mr-2"></i> Расчет стоимости за 30 минут</li>
            <li><i class="fas fa-check text-orange-400 mr-2"></i> Индивидуальный подход</li>
          </ul>
        </div>
        
        <div class="bg-white rounded-xl p-8">
          <form id="main-request-form" class="space-y-4">
            <input type="text" name="name" placeholder="Ваше имя *" required
              class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900">
            <input type="tel" name="phone" placeholder="Телефон *" required
              class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900">
            <input type="email" name="email" placeholder="Email"
              class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900">
            <select name="product" class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900">
              <option value="">Выберите услугу</option>
              <option value="rampa">Мобильная рампа</option>
              <option value="gidro">Гидравлическая рампа</option>
              <option value="estakada">Эстакада</option>
              <option value="other">Другое</option>
            </select>
            <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold transition">
              Отправить заявку
            </button>
          </form>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-gray-900 text-white py-12">
    <div class="container mx-auto px-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div class="flex items-center mb-4">
            <span class="text-2xl font-bold">ARMATA</span>
            <span class="text-2xl font-bold text-orange-500">-RAMPA</span>
          </div>
          <p class="text-gray-400 mb-4">
            Производитель погрузочных рамп и эстакад. Собственное производство с 2010 года.
          </p>
        </div>
        
        <div>
          <h4 class="font-semibold mb-4">Каталог</h4>
          <ul class="space-y-2 text-gray-400">
            <li><a href="/katalog/mobilnye-rampy" class="hover:text-orange-400">Мобильные рампы</a></li>
            <li><a href="/katalog/gidravlicheskie-rampy" class="hover:text-orange-400">Гидравлические рампы</a></li>
            <li><a href="/katalog/estakady" class="hover:text-orange-400">Эстакады</a></li>
          </ul>
        </div>
        
        <div>
          <h4 class="font-semibold mb-4">Информация</h4>
          <ul class="space-y-2 text-gray-400">
            <li><a href="/o-kompanii" class="hover:text-orange-400">О компании</a></li>
            <li><a href="/dostavka" class="hover:text-orange-400">Доставка и оплата</a></li>
            <li><a href="/portfolio" class="hover:text-orange-400">Портфолио</a></li>
            <li><a href="/kontakty" class="hover:text-orange-400">Контакты</a></li>
          </ul>
        </div>
        
        <div>
          <h4 class="font-semibold mb-4">Контакты</h4>
          <ul class="space-y-3 text-gray-400">
            <li>
              <a href="tel:${(settings.phone_main || '+74955553535').replace(/[^+\d]/g, '')}" class="flex items-center hover:text-orange-400">
                <i class="fas fa-phone mr-2"></i>
                ${settings.phone_main || '+7 (495) 555-35-35'}
              </a>
            </li>
            <li>
              <a href="mailto:${settings.email || 'info@armata-rampa.ru'}" class="flex items-center hover:text-orange-400">
                <i class="fas fa-envelope mr-2"></i>
                ${settings.email || 'info@armata-rampa.ru'}
              </a>
            </li>
            <li class="flex items-start">
              <i class="fas fa-map-marker-alt mr-2 mt-1"></i>
              ${settings.address || 'г. Владимир, ул. Промышленная, д. 10'}
            </li>
          </ul>
        </div>
      </div>
      
      <div class="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
        <p class="text-gray-500">&copy; 2024 Armata-Rampa. Все права защищены.</p>
        <div class="flex space-x-4 mt-4 md:mt-0">
          <a href="#" class="text-gray-400 hover:text-orange-400"><i class="fab fa-vk text-xl"></i></a>
          <a href="#" class="text-gray-400 hover:text-orange-400"><i class="fab fa-telegram text-xl"></i></a>
          <a href="#" class="text-gray-400 hover:text-orange-400"><i class="fab fa-whatsapp text-xl"></i></a>
        </div>
      </div>
    </div>
  </footer>

  <!-- Request Modal -->
  <div id="request-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center">
    <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold">Оставить заявку</h3>
        <button onclick="closeRequestModal()" class="text-gray-400 hover:text-gray-600">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      <form id="modal-request-form" class="space-y-4">
        <input type="text" name="name" placeholder="Ваше имя *" required
          class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent">
        <input type="tel" name="phone" placeholder="Телефон *" required
          class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent">
        <textarea name="message" placeholder="Сообщение" rows="3"
          class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"></textarea>
        <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold transition">
          Отправить
        </button>
      </form>
    </div>
  </div>
  `
  
  return c.html(renderPage('Главная', content, 
    'Armata-Rampa — Купить рампы и эстакады от производителя с доставкой по России',
    'Производитель погрузочных рамп и эстакад. Мобильные рампы от 449 000 руб, гидравлические рампы от 679 000 руб. Собственное производство, гарантия 1 год, доставка по России.'
  ))
})

// Catalog page
app.get('/katalog', async (c) => {
  const content = `
  <!-- Header (same as main) -->
  <header class="bg-white shadow-sm sticky top-0 z-50">
    <nav class="container mx-auto px-4 py-4">
      <div class="flex justify-between items-center">
        <a href="/" class="flex items-center">
          <span class="text-2xl font-bold text-blue-900">ARMATA</span>
          <span class="text-2xl font-bold text-orange-500">-RAMPA</span>
        </a>
        <div class="hidden md:flex items-center space-x-6">
          <a href="/katalog" class="text-orange-500 font-medium">Каталог продукции</a>
          <a href="/o-kompanii" class="text-gray-700 hover:text-blue-900 font-medium">О компании</a>
          <a href="/portfolio" class="text-gray-700 hover:text-blue-900 font-medium">Портфолио</a>
          <a href="/dostavka" class="text-gray-700 hover:text-blue-900 font-medium">Доставка</a>
          <a href="/kontakty" class="text-gray-700 hover:text-blue-900 font-medium">Контакты</a>
        </div>
        <button onclick="openRequestModal()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition">
          Оставить заявку
        </button>
      </div>
    </nav>
  </header>

  <!-- Breadcrumbs -->
  <div class="bg-gray-100 py-4">
    <div class="container mx-auto px-4">
      <nav class="text-sm">
        <a href="/" class="text-gray-500 hover:text-blue-900">Главная</a>
        <span class="mx-2 text-gray-400">/</span>
        <span class="text-gray-900">Каталог</span>
      </nav>
    </div>
  </div>

  <!-- Catalog Content -->
  <section class="py-12">
    <div class="container mx-auto px-4">
      <h1 class="text-3xl font-bold mb-8">Каталог продукции</h1>
      
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <!-- Sidebar -->
        <aside class="lg:col-span-1">
          <div class="bg-white rounded-xl p-6 shadow-sm">
            <h3 class="font-semibold mb-4">Категории</h3>
            <ul id="category-filter" class="space-y-2">
              <li>
                <a href="/katalog" class="text-orange-500 font-medium">Все товары</a>
              </li>
              <!-- Categories loaded via JS -->
            </ul>
          </div>
        </aside>
        
        <!-- Products Grid -->
        <div class="lg:col-span-3">
          <div id="products-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <!-- Products loaded via JS -->
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Simple Footer -->
  <footer class="bg-gray-900 text-white py-8">
    <div class="container mx-auto px-4 text-center">
      <p class="text-gray-400">&copy; 2024 Armata-Rampa. Все права защищены.</p>
    </div>
  </footer>

  <!-- Request Modal -->
  <div id="request-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center">
    <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold text-gray-900">Оставить заявку</h3>
        <button onclick="closeRequestModal()" class="text-gray-400 hover:text-gray-600">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      <form id="modal-request-form" class="space-y-4">
        <input type="text" name="name" placeholder="Ваше имя *" required
          class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900">
        <input type="tel" name="phone" placeholder="Телефон *" required
          class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900">
        <textarea name="message" placeholder="Сообщение" rows="3"
          class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"></textarea>
        <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold transition">
          Отправить
        </button>
      </form>
    </div>
  </div>
  `
  
  return c.html(renderPage('Каталог', content,
    'Каталог погрузочных рамп и эстакад | Armata-Rampa',
    'Каталог погрузочных рамп и эстакад от производителя. Мобильные рампы, гидравлические рампы, эстакады. Цены, характеристики, наличие.'
  ))
})

// Category page
app.get('/katalog/:category', async (c) => {
  const categorySlug = c.req.param('category')
  
  // Get category info
  let category: any = null
  try {
    category = await c.env.DB.prepare(
      'SELECT * FROM categories WHERE slug = ? AND is_active = 1'
    ).bind(categorySlug).first()
  } catch (e) {}
  
  if (!category) {
    return c.notFound()
  }
  
  const content = `
  <header class="bg-white shadow-sm sticky top-0 z-50">
    <nav class="container mx-auto px-4 py-4">
      <div class="flex justify-between items-center">
        <a href="/" class="flex items-center">
          <span class="text-2xl font-bold text-blue-900">ARMATA</span>
          <span class="text-2xl font-bold text-orange-500">-RAMPA</span>
        </a>
        <div class="hidden md:flex items-center space-x-6">
          <a href="/katalog" class="text-orange-500 font-medium">Каталог продукции</a>
          <a href="/o-kompanii" class="text-gray-700 hover:text-blue-900 font-medium">О компании</a>
          <a href="/kontakty" class="text-gray-700 hover:text-blue-900 font-medium">Контакты</a>
        </div>
        <button onclick="openRequestModal()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition">
          Оставить заявку
        </button>
      </div>
    </nav>
  </header>

  <div class="bg-gray-100 py-4">
    <div class="container mx-auto px-4">
      <nav class="text-sm">
        <a href="/" class="text-gray-500 hover:text-blue-900">Главная</a>
        <span class="mx-2 text-gray-400">/</span>
        <a href="/katalog" class="text-gray-500 hover:text-blue-900">Каталог</a>
        <span class="mx-2 text-gray-400">/</span>
        <span class="text-gray-900">${category.name}</span>
      </nav>
    </div>
  </div>

  <section class="py-12">
    <div class="container mx-auto px-4">
      <h1 class="text-3xl font-bold mb-4">${category.name}</h1>
      <p class="text-gray-600 mb-8">${category.description || ''}</p>
      
      <div id="products-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-category="${categorySlug}">
        <!-- Products loaded via JS -->
      </div>
    </div>
  </section>

  <footer class="bg-gray-900 text-white py-8">
    <div class="container mx-auto px-4 text-center">
      <p class="text-gray-400">&copy; 2024 Armata-Rampa. Все права защищены.</p>
    </div>
  </footer>

  <div id="request-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center">
    <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold text-gray-900">Оставить заявку</h3>
        <button onclick="closeRequestModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
      </div>
      <form id="modal-request-form" class="space-y-4">
        <input type="text" name="name" placeholder="Ваше имя *" required class="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900">
        <input type="tel" name="phone" placeholder="Телефон *" required class="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900">
        <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold">Отправить</button>
      </form>
    </div>
  </div>
  `
  
  return c.html(renderPage(category.name, content, category.seo_title, category.seo_description))
})

// Product page
app.get('/product/:slug', async (c) => {
  const slug = c.req.param('slug')
  
  let product: any = null
  try {
    product = await c.env.DB.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.slug = ? AND p.is_active = 1
    `).bind(slug).first()
    
    if (product) {
      await c.env.DB.prepare('UPDATE products SET views_count = views_count + 1 WHERE slug = ?').bind(slug).run()
    }
  } catch (e) {}
  
  if (!product) {
    return c.notFound()
  }
  
  const specs = product.specifications ? JSON.parse(product.specifications) : {}
  
  const content = `
  <header class="bg-white shadow-sm sticky top-0 z-50">
    <nav class="container mx-auto px-4 py-4">
      <div class="flex justify-between items-center">
        <a href="/" class="flex items-center">
          <span class="text-2xl font-bold text-blue-900">ARMATA</span>
          <span class="text-2xl font-bold text-orange-500">-RAMPA</span>
        </a>
        <div class="hidden md:flex items-center space-x-6">
          <a href="/katalog" class="text-gray-700 hover:text-blue-900 font-medium">Каталог</a>
          <a href="/o-kompanii" class="text-gray-700 hover:text-blue-900 font-medium">О компании</a>
          <a href="/kontakty" class="text-gray-700 hover:text-blue-900 font-medium">Контакты</a>
        </div>
        <button onclick="openRequestModal()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium">Оставить заявку</button>
      </div>
    </nav>
  </header>

  <div class="bg-gray-100 py-4">
    <div class="container mx-auto px-4">
      <nav class="text-sm">
        <a href="/" class="text-gray-500 hover:text-blue-900">Главная</a>
        <span class="mx-2 text-gray-400">/</span>
        <a href="/katalog" class="text-gray-500 hover:text-blue-900">Каталог</a>
        <span class="mx-2 text-gray-400">/</span>
        ${product.category_name ? `<a href="/katalog/${product.category_slug}" class="text-gray-500 hover:text-blue-900">${product.category_name}</a><span class="mx-2 text-gray-400">/</span>` : ''}
        <span class="text-gray-900">${product.name}</span>
      </nav>
    </div>
  </div>

  <section class="py-12">
    <div class="container mx-auto px-4">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <!-- Image -->
        <div>
          <div class="bg-gray-100 rounded-xl p-8 flex items-center justify-center min-h-[400px]">
            ${product.main_image 
              ? `<img src="${product.main_image}" alt="${product.name}" class="max-w-full max-h-[400px] object-contain">`
              : `<div class="text-gray-400 text-center"><i class="fas fa-image text-6xl mb-4"></i><p>Изображение</p></div>`
            }
          </div>
          ${product.is_hit ? '<span class="absolute top-4 left-4 bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-medium">Хит продаж</span>' : ''}
        </div>
        
        <!-- Info -->
        <div>
          <h1 class="text-3xl font-bold mb-4">${product.name}</h1>
          
          <div class="flex items-center gap-4 mb-6">
            <span class="text-3xl font-bold text-blue-900">${product.price ? product.price.toLocaleString('ru-RU') + ' ₽' : 'Цена по запросу'}</span>
            ${product.old_price ? `<span class="text-xl text-gray-400 line-through">${product.old_price.toLocaleString('ru-RU')} ₽</span>` : ''}
          </div>
          
          <p class="text-gray-600 mb-6">${product.short_description || ''}</p>
          
          <div class="flex items-center gap-2 mb-6">
            ${product.in_stock 
              ? '<span class="flex items-center text-green-600"><i class="fas fa-check-circle mr-2"></i> В наличии</span>'
              : '<span class="flex items-center text-orange-500"><i class="fas fa-clock mr-2"></i> Под заказ</span>'
            }
          </div>
          
          <!-- Specifications -->
          <div class="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 class="font-semibold mb-4">Характеристики</h3>
            <dl class="space-y-2">
              ${Object.entries(specs).map(([key, value]) => `
                <div class="flex justify-between py-2 border-b border-gray-200 last:border-0">
                  <dt class="text-gray-600">${key}</dt>
                  <dd class="font-medium">${value}</dd>
                </div>
              `).join('')}
            </dl>
          </div>
          
          <div class="flex flex-col sm:flex-row gap-4">
            <button onclick="openProductRequestModal('${product.name}')" class="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 px-6 rounded-lg font-semibold transition">
              <i class="fas fa-paper-plane mr-2"></i> Оставить заявку
            </button>
            <a href="tel:+74955553535" class="flex-1 bg-blue-900 hover:bg-blue-800 text-white py-3 px-6 rounded-lg font-semibold transition text-center">
              <i class="fas fa-phone mr-2"></i> Позвонить
            </a>
          </div>
          
          <div class="mt-6 p-4 bg-blue-50 rounded-lg">
            <p class="text-sm text-blue-800">
              <i class="fas fa-info-circle mr-2"></i>
              Стоимость указана с НДС 20%. Продукция сертифицирована. Гарантия 1 год.
            </p>
          </div>
        </div>
      </div>
      
      ${product.full_description ? `
        <div class="mt-12">
          <h2 class="text-2xl font-bold mb-4">Описание</h2>
          <div class="prose max-w-none">${product.full_description}</div>
        </div>
      ` : ''}
    </div>
  </section>

  <footer class="bg-gray-900 text-white py-8">
    <div class="container mx-auto px-4 text-center">
      <p class="text-gray-400">&copy; 2024 Armata-Rampa. Все права защищены.</p>
    </div>
  </footer>

  <div id="request-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center">
    <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold text-gray-900">Заявка на товар</h3>
        <button onclick="closeRequestModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
      </div>
      <p id="modal-product-name" class="text-gray-600 mb-4"></p>
      <form id="modal-request-form" class="space-y-4">
        <input type="hidden" name="product_id" value="${product.id}">
        <input type="text" name="name" placeholder="Ваше имя *" required class="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900">
        <input type="tel" name="phone" placeholder="Телефон *" required class="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900">
        <textarea name="message" placeholder="Комментарий" rows="3" class="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900"></textarea>
        <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold">Отправить заявку</button>
      </form>
    </div>
  </div>

  <!-- Schema.org Product -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "${product.name}",
    "description": "${product.short_description || ''}",
    "image": "${product.main_image || ''}",
    "brand": {
      "@type": "Brand",
      "name": "Armata-Rampa"
    },
    "offers": {
      "@type": "Offer",
      "price": "${product.price || ''}",
      "priceCurrency": "RUB",
      "availability": "${product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder'}",
      "seller": {
        "@type": "Organization",
        "name": "Armata-Rampa"
      }
    }
  }
  </script>
  `
  
  return c.html(renderPage(product.name, content, product.seo_title, product.seo_description))
})

// Static pages (about, delivery, contacts)
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  
  // Skip if it's a known route
  if (['katalog', 'product', 'admin', 'api', 'static', 'images'].includes(slug)) {
    return c.notFound()
  }
  
  let page: any = null
  try {
    page = await c.env.DB.prepare(
      'SELECT * FROM pages WHERE slug = ? AND is_active = 1'
    ).bind(slug).first()
  } catch (e) {}
  
  if (!page) {
    return c.notFound()
  }
  
  const content = `
  <header class="bg-white shadow-sm sticky top-0 z-50">
    <nav class="container mx-auto px-4 py-4">
      <div class="flex justify-between items-center">
        <a href="/" class="flex items-center">
          <span class="text-2xl font-bold text-blue-900">ARMATA</span>
          <span class="text-2xl font-bold text-orange-500">-RAMPA</span>
        </a>
        <div class="hidden md:flex items-center space-x-6">
          <a href="/katalog" class="text-gray-700 hover:text-blue-900 font-medium">Каталог</a>
          <a href="/o-kompanii" class="${slug === 'o-kompanii' ? 'text-orange-500' : 'text-gray-700 hover:text-blue-900'} font-medium">О компании</a>
          <a href="/dostavka" class="${slug === 'dostavka' ? 'text-orange-500' : 'text-gray-700 hover:text-blue-900'} font-medium">Доставка</a>
          <a href="/kontakty" class="${slug === 'kontakty' ? 'text-orange-500' : 'text-gray-700 hover:text-blue-900'} font-medium">Контакты</a>
        </div>
        <button onclick="openRequestModal()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium">Оставить заявку</button>
      </div>
    </nav>
  </header>

  <div class="bg-gray-100 py-4">
    <div class="container mx-auto px-4">
      <nav class="text-sm">
        <a href="/" class="text-gray-500 hover:text-blue-900">Главная</a>
        <span class="mx-2 text-gray-400">/</span>
        <span class="text-gray-900">${page.title}</span>
      </nav>
    </div>
  </div>

  <section class="py-12">
    <div class="container mx-auto px-4">
      <h1 class="text-3xl font-bold mb-8">${page.title}</h1>
      <div class="prose max-w-none">
        ${page.content}
      </div>
    </div>
  </section>

  <footer class="bg-gray-900 text-white py-8">
    <div class="container mx-auto px-4 text-center">
      <p class="text-gray-400">&copy; 2024 Armata-Rampa. Все права защищены.</p>
    </div>
  </footer>

  <div id="request-modal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center">
    <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold text-gray-900">Оставить заявку</h3>
        <button onclick="closeRequestModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
      </div>
      <form id="modal-request-form" class="space-y-4">
        <input type="text" name="name" placeholder="Ваше имя *" required class="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900">
        <input type="tel" name="phone" placeholder="Телефон *" required class="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900">
        <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold">Отправить</button>
      </form>
    </div>
  </div>
  `
  
  return c.html(renderPage(page.title, content, page.seo_title, page.seo_description))
})

// Admin panel route
app.get('/admin', async (c) => {
  const adminContent = `
  <!DOCTYPE html>
  <html lang="ru">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Админ-панель | Armata-Rampa CMS</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  </head>
  <body class="bg-gray-100">
    <div class="min-h-screen flex">
      <!-- Sidebar -->
      <aside class="w-64 bg-blue-900 text-white">
        <div class="p-6">
          <h1 class="text-xl font-bold">Armata-Rampa</h1>
          <p class="text-blue-300 text-sm">Админ-панель</p>
        </div>
        <nav class="mt-6">
          <a href="#dashboard" class="flex items-center px-6 py-3 hover:bg-blue-800 transition" onclick="showSection('dashboard')">
            <i class="fas fa-tachometer-alt w-6"></i> Дашборд
          </a>
          <a href="#products" class="flex items-center px-6 py-3 hover:bg-blue-800 transition" onclick="showSection('products')">
            <i class="fas fa-boxes w-6"></i> Товары
          </a>
          <a href="#categories" class="flex items-center px-6 py-3 hover:bg-blue-800 transition" onclick="showSection('categories')">
            <i class="fas fa-folder w-6"></i> Категории
          </a>
          <a href="#leads" class="flex items-center px-6 py-3 hover:bg-blue-800 transition" onclick="showSection('leads')">
            <i class="fas fa-envelope w-6"></i> Заявки
          </a>
          <a href="#reviews" class="flex items-center px-6 py-3 hover:bg-blue-800 transition" onclick="showSection('reviews')">
            <i class="fas fa-star w-6"></i> Отзывы
          </a>
          <a href="#pages" class="flex items-center px-6 py-3 hover:bg-blue-800 transition" onclick="showSection('pages')">
            <i class="fas fa-file-alt w-6"></i> Страницы
          </a>
          <a href="#settings" class="flex items-center px-6 py-3 hover:bg-blue-800 transition" onclick="showSection('settings')">
            <i class="fas fa-cog w-6"></i> Настройки
          </a>
        </nav>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 p-8">
        <!-- Dashboard -->
        <section id="section-dashboard" class="admin-section">
          <h2 class="text-2xl font-bold mb-6">Дашборд</h2>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-gray-500 text-sm">Товаров</p>
                  <p id="stat-products" class="text-3xl font-bold text-blue-900">0</p>
                </div>
                <i class="fas fa-boxes text-3xl text-blue-200"></i>
              </div>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-gray-500 text-sm">Заявок сегодня</p>
                  <p id="stat-leads" class="text-3xl font-bold text-orange-500">0</p>
                </div>
                <i class="fas fa-envelope text-3xl text-orange-200"></i>
              </div>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-gray-500 text-sm">Отзывов</p>
                  <p id="stat-reviews" class="text-3xl font-bold text-green-500">0</p>
                </div>
                <i class="fas fa-star text-3xl text-green-200"></i>
              </div>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-gray-500 text-sm">Категорий</p>
                  <p id="stat-categories" class="text-3xl font-bold text-purple-500">0</p>
                </div>
                <i class="fas fa-folder text-3xl text-purple-200"></i>
              </div>
            </div>
          </div>
          
          <div class="bg-white rounded-xl p-6 shadow-sm">
            <h3 class="font-semibold mb-4">Последние заявки</h3>
            <div id="recent-leads" class="space-y-2">
              <!-- Loaded via JS -->
            </div>
          </div>
        </section>

        <!-- Products Section -->
        <section id="section-products" class="admin-section hidden">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold">Товары</h2>
            <button onclick="showProductModal()" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg">
              <i class="fas fa-plus mr-2"></i> Добавить товар
            </button>
          </div>
          <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Товар</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Категория</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Цена</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
                </tr>
              </thead>
              <tbody id="products-table" class="divide-y divide-gray-200">
                <!-- Loaded via JS -->
              </tbody>
            </table>
          </div>
        </section>

        <!-- Leads Section -->
        <section id="section-leads" class="admin-section hidden">
          <h2 class="text-2xl font-bold mb-6">Заявки</h2>
          <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Имя</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Телефон</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Товар</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
                </tr>
              </thead>
              <tbody id="leads-table" class="divide-y divide-gray-200">
                <!-- Loaded via JS -->
              </tbody>
            </table>
          </div>
        </section>

        <!-- Other sections... -->
        <section id="section-categories" class="admin-section hidden">
          <h2 class="text-2xl font-bold mb-6">Категории</h2>
          <p class="text-gray-600">Управление категориями товаров</p>
        </section>

        <section id="section-reviews" class="admin-section hidden">
          <h2 class="text-2xl font-bold mb-6">Отзывы</h2>
          <p class="text-gray-600">Модерация отзывов клиентов</p>
        </section>

        <section id="section-pages" class="admin-section hidden">
          <h2 class="text-2xl font-bold mb-6">Страницы</h2>
          <p class="text-gray-600">Редактирование статических страниц</p>
        </section>

        <section id="section-settings" class="admin-section hidden">
          <h2 class="text-2xl font-bold mb-6">Настройки сайта</h2>
          <div class="bg-white rounded-xl p-6 shadow-sm max-w-2xl">
            <form id="settings-form" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Название сайта</label>
                <input type="text" name="site_name" class="w-full px-4 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Основной телефон</label>
                <input type="text" name="phone_main" class="w-full px-4 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" name="email" class="w-full px-4 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                <input type="text" name="address" class="w-full px-4 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Режим работы</label>
                <input type="text" name="working_hours" class="w-full px-4 py-2 border rounded-lg">
              </div>
              <button type="submit" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg">
                Сохранить настройки
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>

    <script>
      // Admin panel JS
      function showSection(section) {
        document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));
        document.getElementById('section-' + section).classList.remove('hidden');
      }

      async function loadDashboard() {
        // Load stats
        const [products, leads, reviews, categories] = await Promise.all([
          fetch('/api/admin/products').then(r => r.json()),
          fetch('/api/admin/leads').then(r => r.json()),
          fetch('/api/reviews').then(r => r.json()),
          fetch('/api/categories').then(r => r.json())
        ]);
        
        document.getElementById('stat-products').textContent = products.data?.length || 0;
        document.getElementById('stat-leads').textContent = leads.data?.length || 0;
        document.getElementById('stat-reviews').textContent = reviews.data?.length || 0;
        document.getElementById('stat-categories').textContent = categories.data?.length || 0;
        
        // Recent leads
        const recentLeads = (leads.data || []).slice(0, 5);
        document.getElementById('recent-leads').innerHTML = recentLeads.map(lead => \`
          <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p class="font-medium">\${lead.name}</p>
              <p class="text-sm text-gray-500">\${lead.phone}</p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full \${lead.status === 'new' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}">
              \${lead.status === 'new' ? 'Новая' : 'Обработана'}
            </span>
          </div>
        \`).join('') || '<p class="text-gray-500">Заявок пока нет</p>';
      }

      async function loadProducts() {
        const response = await fetch('/api/admin/products');
        const data = await response.json();
        
        document.getElementById('products-table').innerHTML = (data.data || []).map(product => \`
          <tr>
            <td class="px-6 py-4">
              <div class="flex items-center">
                <div class="w-10 h-10 bg-gray-100 rounded flex items-center justify-center mr-3">
                  <i class="fas fa-image text-gray-400"></i>
                </div>
                <div>
                  <p class="font-medium">\${product.name}</p>
                  <p class="text-sm text-gray-500">\${product.slug}</p>
                </div>
              </div>
            </td>
            <td class="px-6 py-4 text-gray-500">\${product.category_name || '-'}</td>
            <td class="px-6 py-4">\${product.price ? product.price.toLocaleString('ru-RU') + ' ₽' : '-'}</td>
            <td class="px-6 py-4">
              <span class="px-2 py-1 rounded-full text-xs \${product.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}">
                \${product.is_active ? 'Активен' : 'Скрыт'}
              </span>
            </td>
            <td class="px-6 py-4">
              <button onclick="editProduct(\${product.id})" class="text-blue-600 hover:text-blue-800 mr-2">
                <i class="fas fa-edit"></i>
              </button>
              <button onclick="deleteProduct(\${product.id})" class="text-red-600 hover:text-red-800">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        \`).join('') || '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Товаров пока нет</td></tr>';
      }

      async function loadLeads() {
        const response = await fetch('/api/admin/leads');
        const data = await response.json();
        
        document.getElementById('leads-table').innerHTML = (data.data || []).map(lead => \`
          <tr>
            <td class="px-6 py-4 text-sm text-gray-500">\${new Date(lead.created_at).toLocaleString('ru-RU')}</td>
            <td class="px-6 py-4 font-medium">\${lead.name}</td>
            <td class="px-6 py-4">\${lead.phone}</td>
            <td class="px-6 py-4 text-gray-500">\${lead.product_name || '-'}</td>
            <td class="px-6 py-4">
              <select onchange="updateLeadStatus(\${lead.id}, this.value)" class="text-sm border rounded px-2 py-1">
                <option value="new" \${lead.status === 'new' ? 'selected' : ''}>Новая</option>
                <option value="processing" \${lead.status === 'processing' ? 'selected' : ''}>В работе</option>
                <option value="completed" \${lead.status === 'completed' ? 'selected' : ''}>Завершена</option>
              </select>
            </td>
            <td class="px-6 py-4">
              <a href="tel:\${lead.phone}" class="text-green-600 hover:text-green-800">
                <i class="fas fa-phone"></i>
              </a>
            </td>
          </tr>
        \`).join('') || '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Заявок пока нет</td></tr>';
      }

      async function updateLeadStatus(id, status) {
        await fetch('/api/admin/leads/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        loadLeads();
        loadDashboard();
      }

      async function loadSettings() {
        const response = await fetch('/api/settings');
        const data = await response.json();
        const settings = data.data || {};
        
        const form = document.getElementById('settings-form');
        Object.keys(settings).forEach(key => {
          const input = form.querySelector('[name="' + key + '"]');
          if (input) input.value = settings[key];
        });
      }

      document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const settings = Object.fromEntries(formData);
        
        await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        
        alert('Настройки сохранены');
      });

      // Init
      loadDashboard();
      loadProducts();
      loadLeads();
      loadSettings();
    </script>
  </body>
  </html>
  `
  
  return c.html(adminContent)
})

export default app
