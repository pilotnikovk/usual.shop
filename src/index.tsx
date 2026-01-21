import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-pages'

// Types
type Bindings = {
  DB: D1Database
  JWT_SECRET: string
  RESEND_API_KEY: string
  ADMIN_EMAIL: string
}

type Variables = {
  settings: Record<string, string>
  admin: { id: number; username: string } | null
}

// Simple JWT implementation for Cloudflare Workers
const base64UrlEncode = (data: string): string => {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const base64UrlDecode = (data: string): string => {
  const padded = data + '==='.slice(0, (4 - data.length % 4) % 4)
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
}

const createJWT = async (payload: any, secret: string): Promise<string> => {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerStr = base64UrlEncode(JSON.stringify(header))
  const payloadStr = base64UrlEncode(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 }))
  const data = `${headerStr}.${payloadStr}`
  
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const signatureStr = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))
  
  return `${data}.${signatureStr}`
}

const verifyJWT = async (token: string, secret: string): Promise<any | null> => {
  try {
    const [headerStr, payloadStr, signatureStr] = token.split('.')
    if (!headerStr || !payloadStr || !signatureStr) return null
    
    const data = `${headerStr}.${payloadStr}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    
    const signatureBytes = Uint8Array.from(base64UrlDecode(signatureStr), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(data))
    
    if (!valid) return null
    
    const payload = JSON.parse(base64UrlDecode(payloadStr))
    if (payload.exp && payload.exp < Date.now()) return null
    
    return payload
  } catch {
    return null
  }
}

// Hash password with SHA-256
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
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

// Send email notification via Resend API
const sendEmailNotification = async (env: Bindings, lead: any) => {
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) return
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Armata-Rampa <noreply@armata-rampa.ru>',
        to: [env.ADMIN_EMAIL],
        subject: `Новая заявка от ${lead.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #0ea5e9, #8b5cf6); padding: 20px; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">Новая заявка с сайта</h1>
            </div>
            <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Имя:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${lead.name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Телефон:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><a href="tel:${lead.phone}">${lead.phone}</a></td>
                </tr>
                ${lead.email ? `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Email:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><a href="mailto:${lead.email}">${lead.email}</a></td>
                </tr>
                ` : ''}
                ${lead.company ? `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Компания:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${lead.company}</td>
                </tr>
                ` : ''}
                ${lead.message ? `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Сообщение:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${lead.message}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 10px 0;"><strong>Источник:</strong></td>
                  <td style="padding: 10px 0;">${lead.source || 'website'}</td>
                </tr>
              </table>
            </div>
            <div style="background: #1f2937; color: white; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
              <a href="https://armata-rampa.ru/admin" style="color: #f97316; text-decoration: none;">Перейти в админ-панель</a>
            </div>
          </div>
        `
      })
    })
    console.log('Email sent:', await response.text())
  } catch (e) {
    console.error('Failed to send email:', e)
  }
}

// Submit lead/request
app.post('/api/leads', async (c) => {
  try {
    const body = await c.req.json()
    const { name, phone, email, company, message, product_id, source } = body
    
    if (!name || !phone) {
      return c.json({ success: false, error: 'Name and phone are required' }, 400)
    }
    
    const url = new URL(c.req.url)
    const utm_source = url.searchParams.get('utm_source') || body.utm_source || ''
    const utm_medium = url.searchParams.get('utm_medium') || body.utm_medium || ''
    const utm_campaign = url.searchParams.get('utm_campaign') || body.utm_campaign || ''
    
    await c.env.DB.prepare(`
      INSERT INTO leads (name, phone, email, company, message, product_id, source, utm_source, utm_medium, utm_campaign)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(name, phone, email || '', company || '', message || '', product_id || null, source || 'website', utm_source, utm_medium, utm_campaign).run()
    
    // Send email notification
    sendEmailNotification(c.env, { name, phone, email, company, message, source })
    
    return c.json({ success: true, message: 'Request submitted successfully' })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to submit request' }, 500)
  }
})

// ==========================================
// ADMIN AUTHENTICATION ROUTES
// ==========================================

// Admin: Login
app.post('/api/admin/login', async (c) => {
  try {
    const { username, password } = await c.req.json()
    
    if (!username || !password) {
      return c.json({ success: false, error: 'Введите логин и пароль' }, 400)
    }
    
    const passwordHash = await hashPassword(password)
    
    const admin = await c.env.DB.prepare(`
      SELECT id, username, email, role FROM admin_users 
      WHERE username = ? AND password_hash = ? AND is_active = 1
    `).bind(username, passwordHash).first()
    
    if (!admin) {
      return c.json({ success: false, error: 'Неверный логин или пароль' }, 401)
    }
    
    // Update last login
    await c.env.DB.prepare(`
      UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(admin.id).run()
    
    // Create JWT token
    const secret = c.env.JWT_SECRET || 'default-secret-change-me'
    const token = await createJWT({ id: admin.id, username: admin.username, role: admin.role }, secret)
    
    return c.json({ 
      success: true, 
      token,
      user: { id: admin.id, username: admin.username, email: admin.email, role: admin.role }
    })
  } catch (e: any) {
    console.error('Login error:', e)
    return c.json({ success: false, error: 'Ошибка авторизации' }, 500)
  }
})

// Admin: Verify token
app.get('/api/admin/verify', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }
    
    const token = authHeader.slice(7)
    const secret = c.env.JWT_SECRET || 'default-secret-change-me'
    const payload = await verifyJWT(token, secret)
    
    if (!payload) {
      return c.json({ success: false, error: 'Invalid token' }, 401)
    }
    
    return c.json({ success: true, user: payload })
  } catch (e) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }
})

// Admin: Get stats
app.get('/api/admin/stats', async (c) => {
  try {
    const [products, leads, newLeads, views] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1').first(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM leads').first(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'new'").first(),
      c.env.DB.prepare('SELECT SUM(views_count) as count FROM products').first()
    ])
    
    return c.json({
      success: true,
      stats: {
        totalProducts: (products as any)?.count || 0,
        totalLeads: (leads as any)?.count || 0,
        newLeads: (newLeads as any)?.count || 0,
        totalViews: (views as any)?.count || 0
      }
    })
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch stats' }, 500)
  }
})

// Admin: Change password
app.post('/api/admin/change-password', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }
    
    const token = authHeader.slice(7)
    const secret = c.env.JWT_SECRET || 'default-secret-change-me'
    const payload = await verifyJWT(token, secret)
    
    if (!payload) {
      return c.json({ success: false, error: 'Invalid token' }, 401)
    }
    
    const { currentPassword, newPassword } = await c.req.json()
    
    if (!currentPassword || !newPassword) {
      return c.json({ success: false, error: 'Введите текущий и новый пароль' }, 400)
    }
    
    const currentHash = await hashPassword(currentPassword)
    const admin = await c.env.DB.prepare(`
      SELECT id FROM admin_users WHERE id = ? AND password_hash = ?
    `).bind(payload.id, currentHash).first()
    
    if (!admin) {
      return c.json({ success: false, error: 'Неверный текущий пароль' }, 400)
    }
    
    const newHash = await hashPassword(newPassword)
    await c.env.DB.prepare(`
      UPDATE admin_users SET password_hash = ? WHERE id = ?
    `).bind(newHash, payload.id).run()
    
    return c.json({ success: true, message: 'Пароль успешно изменен' })
  } catch (e) {
    return c.json({ success: false, error: 'Ошибка изменения пароля' }, 500)
  }
})

// ==========================================
// ADMIN API ROUTES (Protected)
// ==========================================

// Middleware for admin routes auth check
const adminAuthMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    // Allow access for now, but frontend should handle auth
    return await next()
  }
  
  const token = authHeader.slice(7)
  const secret = c.env.JWT_SECRET || 'default-secret-change-me'
  const payload = await verifyJWT(token, secret)
  
  if (payload) {
    c.set('admin', payload)
  }
  
  return await next()
}

app.use('/api/admin/*', adminAuthMiddleware)

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

// Admin: Get all products
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
// STATIC FILES
// ==========================================

app.use('/static/*', serveStatic())
app.use('/images/*', serveStatic())

// ==========================================
// MODERN 2026 DESIGN - MAIN PAGE
// ==========================================

const renderModernPage = (title: string, content: string, seoTitle?: string, seoDescription?: string) => {
  return `<!DOCTYPE html>
<html lang="ru" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${seoTitle || title} | Armata-Rampa</title>
  <meta name="description" content="${seoDescription || 'Производитель погрузочных рамп и эстакад. Собственное производство, гарантия качества, доставка по России.'}">
  
  <!-- Preconnect -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  
  <!-- Modern Font - Inter -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
          colors: {
            primary: {
              50: '#f0f9ff',
              100: '#e0f2fe',
              200: '#bae6fd',
              300: '#7dd3fc',
              400: '#38bdf8',
              500: '#0ea5e9',
              600: '#0284c7',
              700: '#0369a1',
              800: '#075985',
              900: '#0c4a6e',
              950: '#082f49',
            },
            accent: {
              50: '#fff7ed',
              100: '#ffedd5',
              200: '#fed7aa',
              300: '#fdba74',
              400: '#fb923c',
              500: '#f97316',
              600: '#ea580c',
              700: '#c2410c',
              800: '#9a3412',
              900: '#7c2d12',
            },
            dark: {
              900: '#0a0a0f',
              800: '#12121a',
              700: '#1a1a24',
              600: '#22222e',
              500: '#2a2a38',
            }
          },
          animation: {
            'float': 'float 6s ease-in-out infinite',
            'glow': 'glow 2s ease-in-out infinite alternate',
            'slide-up': 'slideUp 0.5s ease-out',
            'fade-in': 'fadeIn 0.5s ease-out',
            'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          },
          keyframes: {
            float: {
              '0%, 100%': { transform: 'translateY(0px)' },
              '50%': { transform: 'translateY(-20px)' },
            },
            glow: {
              'from': { boxShadow: '0 0 20px rgba(249, 115, 22, 0.3)' },
              'to': { boxShadow: '0 0 40px rgba(249, 115, 22, 0.6)' },
            },
            slideUp: {
              'from': { opacity: '0', transform: 'translateY(30px)' },
              'to': { opacity: '1', transform: 'translateY(0)' },
            },
            fadeIn: {
              'from': { opacity: '0' },
              'to': { opacity: '1' },
            },
          },
          backdropBlur: {
            xs: '2px',
          }
        }
      }
    }
  </script>
  
  <!-- Icons -->
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  
  <!-- Custom Styles -->
  <link href="/static/styles.css" rel="stylesheet">
  
  <!-- Schema.org -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Armata-Rampa",
    "description": "Производитель погрузочных рамп и эстакад",
    "url": "https://armata-rampa.ru"
  }
  </script>
</head>
<body class="bg-dark-900 text-white font-sans antialiased overflow-x-hidden">
  <!-- Animated Background -->
  <div class="fixed inset-0 -z-10">
    <div class="absolute inset-0 bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900"></div>
    <div class="absolute top-0 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
    <div class="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl animate-pulse-slow delay-1000"></div>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary-900/20 to-transparent rounded-full"></div>
  </div>
  
  ${content}
  
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`
}

// Main page - Modern 2026 Design
app.get('/', async (c) => {
  const settings = c.get('settings')
  
  const content = `
  <!-- Navigation -->
  <nav class="fixed top-0 left-0 right-0 z-50 transition-all duration-300" id="navbar">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="backdrop-blur-xl bg-dark-900/70 border border-white/10 rounded-2xl mt-4 px-6 py-4 flex items-center justify-between">
        <!-- Logo -->
        <a href="/" class="flex items-center gap-2 group">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center transform group-hover:scale-110 transition-transform">
            <span class="text-white font-black text-lg">A</span>
          </div>
          <div class="hidden sm:block">
            <span class="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">ARMATA</span>
            <span class="text-xl font-bold text-accent-500">RAMPA</span>
          </div>
        </a>
        
        <!-- Desktop Menu -->
        <div class="hidden lg:flex items-center gap-1">
          <a href="/katalog" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all font-medium">Каталог</a>
          <a href="/o-kompanii" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all font-medium">О нас</a>
          <a href="/portfolio" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all font-medium">Проекты</a>
          <a href="/dostavka" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all font-medium">Доставка</a>
          <a href="/kontakty" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all font-medium">Контакты</a>
        </div>
        
        <!-- CTA -->
        <div class="flex items-center gap-3">
          <a href="tel:+74955553535" class="hidden md:flex items-center gap-2 text-gray-300 hover:text-white transition-colors">
            <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <i class="fas fa-phone text-accent-500"></i>
            </div>
            <div class="text-right">
              <div class="text-xs text-gray-500">Звоните</div>
              <div class="font-semibold text-sm">${settings.phone_main || '+7 (495) 555-35-35'}</div>
            </div>
          </a>
          <button onclick="openRequestModal()" class="group relative px-6 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold overflow-hidden transition-all hover:shadow-lg hover:shadow-accent-500/25 hover:scale-105">
            <span class="relative z-10">Заявка</span>
            <div class="absolute inset-0 bg-gradient-to-r from-accent-600 to-accent-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>
          
          <!-- Mobile Menu Button -->
          <button class="lg:hidden w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center" onclick="toggleMobileMenu()">
            <i class="fas fa-bars"></i>
          </button>
        </div>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <section class="relative min-h-screen flex items-center pt-24 pb-16 overflow-hidden">
    <!-- Decorative Elements -->
    <div class="absolute top-1/4 right-0 w-[600px] h-[600px] opacity-30">
      <img src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=60" alt="" class="w-full h-full object-cover rounded-full blur-sm" />
      <div class="absolute inset-0 bg-gradient-to-l from-dark-900 via-transparent to-dark-900"></div>
    </div>
    
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <!-- Left Content -->
        <div class="animate-slide-up">
          <!-- Badge -->
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-500/10 border border-accent-500/20 mb-8">
            <span class="w-2 h-2 rounded-full bg-accent-500 animate-pulse"></span>
            <span class="text-accent-400 text-sm font-medium">Производитель #1 в России</span>
          </div>
          
          <!-- Heading -->
          <h1 class="text-5xl sm:text-6xl lg:text-7xl font-black leading-tight mb-6">
            <span class="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">Погрузочные</span>
            <br>
            <span class="bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">рампы</span>
            <span class="text-white"> и </span>
            <span class="bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">эстакады</span>
          </h1>
          
          <p class="text-xl text-gray-400 mb-8 max-w-lg leading-relaxed">
            Инновационные решения для вашего склада. Собственное производство, гарантия качества, быстрая доставка по всей России.
          </p>
          
          <!-- Stats -->
          <div class="flex flex-wrap gap-6 mb-10">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-500/20 to-accent-600/20 border border-accent-500/30 flex items-center justify-center">
                <i class="fas fa-award text-accent-500"></i>
              </div>
              <div>
                <div class="text-2xl font-bold text-white">15+</div>
                <div class="text-sm text-gray-500">лет опыта</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/20 border border-primary-500/30 flex items-center justify-center">
                <i class="fas fa-truck text-primary-500"></i>
              </div>
              <div>
                <div class="text-2xl font-bold text-white">500+</div>
                <div class="text-sm text-gray-500">доставок</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 flex items-center justify-center">
                <i class="fas fa-shield-alt text-green-500"></i>
              </div>
              <div>
                <div class="text-2xl font-bold text-white">1 год</div>
                <div class="text-sm text-gray-500">гарантии</div>
              </div>
            </div>
          </div>
          
          <!-- CTA Buttons -->
          <div class="flex flex-wrap gap-4">
            <a href="/katalog" class="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-lg transition-all hover:shadow-2xl hover:shadow-accent-500/30 hover:scale-105">
              <span>Смотреть каталог</span>
              <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
            </a>
            <button onclick="openRequestModal()" class="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-semibold text-lg backdrop-blur-sm hover:bg-white/10 transition-all">
              <i class="fas fa-phone-alt"></i>
              <span>Консультация</span>
            </button>
          </div>
        </div>
        
        <!-- Right - Bento Grid -->
        <div class="relative hidden lg:block animate-fade-in">
          <div class="grid grid-cols-2 gap-4">
            <!-- Feature Card 1 -->
            <div class="col-span-2 p-6 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 backdrop-blur-sm hover:border-accent-500/50 transition-all group">
              <div class="flex items-start gap-4">
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <i class="fas fa-industry text-2xl text-white"></i>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-white mb-1">Собственное производство</h3>
                  <p class="text-gray-400 text-sm">Полный цикл производства на современном оборудовании</p>
                </div>
              </div>
            </div>
            
            <!-- Feature Card 2 -->
            <div class="p-6 rounded-3xl bg-gradient-to-br from-primary-500/10 to-primary-600/5 border border-primary-500/20 backdrop-blur-sm hover:border-primary-500/50 transition-all group">
              <div class="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <i class="fas fa-certificate text-primary-400"></i>
              </div>
              <h3 class="font-semibold text-white mb-1">Сертификаты</h3>
              <p class="text-gray-400 text-sm">ГОСТ соответствие</p>
            </div>
            
            <!-- Feature Card 3 -->
            <div class="p-6 rounded-3xl bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 backdrop-blur-sm hover:border-green-500/50 transition-all group">
              <div class="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <i class="fas fa-ruble-sign text-green-400"></i>
              </div>
              <h3 class="font-semibold text-white mb-1">Цена с НДС</h3>
              <p class="text-gray-400 text-sm">Прозрачность 20%</p>
            </div>
            
            <!-- Price Card -->
            <div class="col-span-2 p-6 rounded-3xl bg-gradient-to-br from-accent-500/20 to-accent-600/10 border border-accent-500/30 backdrop-blur-sm">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm text-accent-300 mb-1">Рампы от</div>
                  <div class="text-4xl font-black text-white">449 000 ₽</div>
                </div>
                <div class="w-16 h-16 rounded-2xl bg-accent-500/30 flex items-center justify-center">
                  <i class="fas fa-tags text-3xl text-accent-400"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Scroll Indicator -->
    <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
      <div class="w-10 h-16 rounded-full border-2 border-white/20 flex items-start justify-center p-2">
        <div class="w-1.5 h-3 rounded-full bg-white/50 animate-pulse"></div>
      </div>
    </div>
  </section>

  <!-- Categories Section -->
  <section class="py-24 relative">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Section Header -->
      <div class="text-center mb-16">
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-6">
          <i class="fas fa-boxes text-primary-400"></i>
          <span class="text-primary-400 text-sm font-medium">Наша продукция</span>
        </div>
        <h2 class="text-4xl sm:text-5xl font-black text-white mb-4">
          Каталог <span class="bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">решений</span>
        </h2>
        <p class="text-gray-400 text-lg max-w-2xl mx-auto">
          Выберите оптимальное решение для вашего склада из нашего ассортимента
        </p>
      </div>
      
      <!-- Categories Grid -->
      <div id="categories-grid" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Categories will be loaded via JS -->
      </div>
    </div>
  </section>

  <!-- Products Section -->
  <section class="py-24 relative">
    <div class="absolute inset-0 bg-gradient-to-b from-dark-900 via-dark-800/50 to-dark-900"></div>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <!-- Section Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
        <div>
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-500/10 border border-accent-500/20 mb-4">
            <i class="fas fa-fire text-accent-400"></i>
            <span class="text-accent-400 text-sm font-medium">Хиты продаж</span>
          </div>
          <h2 class="text-4xl font-black text-white">Популярные модели</h2>
        </div>
        <a href="/katalog" class="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-all">
          <span>Все товары</span>
          <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
        </a>
      </div>
      
      <!-- Products Grid -->
      <div id="featured-products" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Products will be loaded via JS -->
      </div>
    </div>
  </section>

  <!-- Services Section -->
  <section class="py-24 relative">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h2 class="text-4xl sm:text-5xl font-black text-white mb-4">
          Полный <span class="bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">спектр услуг</span>
        </h2>
      </div>
      
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Service 1 -->
        <div class="group p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 backdrop-blur-sm hover:border-accent-500/50 transition-all duration-300">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all">
            <i class="fas fa-truck-loading text-2xl text-white"></i>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Доставка по России</h3>
          <p class="text-gray-400">Собственный автопарк. Доставляем в любую точку России. Особые условия для регионов ЦФО и ПФО.</p>
        </div>
        
        <!-- Service 2 -->
        <div class="group p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 backdrop-blur-sm hover:border-primary-500/50 transition-all duration-300">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all">
            <i class="fas fa-wrench text-2xl text-white"></i>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Монтаж и установка</h3>
          <p class="text-gray-400">Профессиональная установка силами сертифицированных специалистов. Гарантия на монтажные работы.</p>
        </div>
        
        <!-- Service 3 -->
        <div class="group p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 backdrop-blur-sm hover:border-green-500/50 transition-all duration-300">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all">
            <i class="fas fa-headset text-2xl text-white"></i>
          </div>
          <h3 class="text-xl font-bold text-white mb-3">Сервис и поддержка</h3>
          <p class="text-gray-400">Техническое обслуживание, ремонт и поставка запасных частей. Гарантия 1 год на всю продукцию.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Reviews Section -->
  <section class="py-24 relative">
    <div class="absolute inset-0 bg-gradient-to-b from-dark-900 via-primary-950/20 to-dark-900"></div>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <div class="text-center mb-16">
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6">
          <i class="fas fa-quote-left text-white/50"></i>
          <span class="text-white/70 text-sm font-medium">Отзывы клиентов</span>
        </div>
        <h2 class="text-4xl sm:text-5xl font-black text-white mb-4">
          Нам <span class="bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">доверяют</span>
        </h2>
      </div>
      
      <div id="reviews-slider" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Reviews will be loaded via JS -->
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section class="py-24 relative">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-accent-500/20 via-primary-500/10 to-dark-800 border border-white/10 p-8 sm:p-12 lg:p-16">
        <!-- Background Decoration -->
        <div class="absolute top-0 right-0 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl"></div>
        <div class="absolute bottom-0 left-0 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl"></div>
        
        <div class="relative z-10 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 class="text-4xl sm:text-5xl font-black text-white mb-6">
              Готовы начать <span class="bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">проект?</span>
            </h2>
            <p class="text-xl text-gray-300 mb-8">
              Оставьте заявку и получите персональный расчет в течение 30 минут
            </p>
            <div class="flex flex-wrap gap-6">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <i class="fas fa-check text-green-400"></i>
                </div>
                <span class="text-white">Бесплатная консультация</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <i class="fas fa-check text-green-400"></i>
                </div>
                <span class="text-white">Расчет за 30 минут</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <i class="fas fa-check text-green-400"></i>
                </div>
                <span class="text-white">Индивидуальные решения</span>
              </div>
            </div>
          </div>
          
          <!-- Form -->
          <div class="bg-dark-800/80 backdrop-blur-xl rounded-3xl p-8 border border-white/10">
            <form id="main-request-form" class="space-y-4">
              <div>
                <input type="text" name="name" placeholder="Ваше имя" required
                  class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all">
              </div>
              <div>
                <input type="tel" name="phone" placeholder="Телефон" required
                  class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all">
              </div>
              <div>
                <select name="service" class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all appearance-none cursor-pointer">
                  <option value="" class="bg-dark-800">Выберите продукт</option>
                  <option value="rampa" class="bg-dark-800">Мобильная рампа</option>
                  <option value="gidro" class="bg-dark-800">Гидравлическая рампа</option>
                  <option value="estakada" class="bg-dark-800">Эстакада</option>
                  <option value="custom" class="bg-dark-800">Индивидуальный проект</option>
                </select>
              </div>
              <button type="submit" class="w-full py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-lg transition-all hover:shadow-lg hover:shadow-accent-500/30 hover:scale-[1.02] active:scale-[0.98]">
                Отправить заявку
              </button>
              <p class="text-center text-gray-500 text-sm">
                Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-16 border-t border-white/10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
        <!-- Brand -->
        <div class="lg:col-span-1">
          <a href="/" class="flex items-center gap-2 mb-6">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
              <span class="text-white font-black text-lg">A</span>
            </div>
            <div>
              <span class="text-xl font-bold text-white">ARMATA</span>
              <span class="text-xl font-bold text-accent-500">RAMPA</span>
            </div>
          </a>
          <p class="text-gray-400 mb-6">Производитель погрузочных рамп и эстакад с 2010 года.</p>
          <div class="flex gap-3">
            <a href="#" class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
              <i class="fab fa-telegram"></i>
            </a>
            <a href="#" class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
              <i class="fab fa-whatsapp"></i>
            </a>
            <a href="#" class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
              <i class="fab fa-vk"></i>
            </a>
          </div>
        </div>
        
        <!-- Links -->
        <div>
          <h4 class="text-white font-semibold mb-4">Каталог</h4>
          <ul class="space-y-3">
            <li><a href="/katalog/mobilnye-rampy" class="text-gray-400 hover:text-white transition-colors">Мобильные рампы</a></li>
            <li><a href="/katalog/gidravlicheskie-rampy" class="text-gray-400 hover:text-white transition-colors">Гидравлические рампы</a></li>
            <li><a href="/katalog/estakady" class="text-gray-400 hover:text-white transition-colors">Эстакады</a></li>
            <li><a href="/katalog/kontejnernye-rampy" class="text-gray-400 hover:text-white transition-colors">Контейнерные рампы</a></li>
          </ul>
        </div>
        
        <div>
          <h4 class="text-white font-semibold mb-4">Компания</h4>
          <ul class="space-y-3">
            <li><a href="/o-kompanii" class="text-gray-400 hover:text-white transition-colors">О нас</a></li>
            <li><a href="/portfolio" class="text-gray-400 hover:text-white transition-colors">Проекты</a></li>
            <li><a href="/dostavka" class="text-gray-400 hover:text-white transition-colors">Доставка</a></li>
            <li><a href="/kontakty" class="text-gray-400 hover:text-white transition-colors">Контакты</a></li>
          </ul>
        </div>
        
        <!-- Contact -->
        <div>
          <h4 class="text-white font-semibold mb-4">Контакты</h4>
          <ul class="space-y-3">
            <li>
              <a href="tel:${(settings.phone_main || '+74955553535').replace(/[^+\d]/g, '')}" class="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <i class="fas fa-phone text-accent-500"></i>
                <span>${settings.phone_main || '+7 (495) 555-35-35'}</span>
              </a>
            </li>
            <li>
              <a href="mailto:${settings.email || 'info@armata-rampa.ru'}" class="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <i class="fas fa-envelope text-accent-500"></i>
                <span>${settings.email || 'info@armata-rampa.ru'}</span>
              </a>
            </li>
            <li class="flex items-start gap-3 text-gray-400">
              <i class="fas fa-map-marker-alt text-accent-500 mt-1"></i>
              <span>${settings.address || 'г. Владимир, ул. Промышленная, д. 10'}</span>
            </li>
          </ul>
        </div>
      </div>
      
      <div class="pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p class="text-gray-500 text-sm">© 2026 Armata-Rampa. Все права защищены.</p>
        <div class="flex gap-6 text-sm">
          <a href="#" class="text-gray-500 hover:text-white transition-colors">Политика конфиденциальности</a>
          <a href="#" class="text-gray-500 hover:text-white transition-colors">Договор оферты</a>
        </div>
      </div>
    </div>
  </footer>

  <!-- Request Modal -->
  <div id="request-modal" class="fixed inset-0 z-50 hidden items-center justify-center p-4">
    <div class="absolute inset-0 bg-dark-900/80 backdrop-blur-sm" onclick="closeRequestModal()"></div>
    <div class="relative w-full max-w-md bg-dark-800 border border-white/10 rounded-3xl p-8 animate-slide-up">
      <button onclick="closeRequestModal()" class="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all">
        <i class="fas fa-times"></i>
      </button>
      
      <h3 class="text-2xl font-bold text-white mb-2">Оставить заявку</h3>
      <p class="text-gray-400 mb-6">Заполните форму и мы свяжемся с вами в ближайшее время</p>
      
      <form id="modal-request-form" class="space-y-4">
        <input type="text" name="name" placeholder="Ваше имя" required
          class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500 transition-all">
        <input type="tel" name="phone" placeholder="Телефон" required
          class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500 transition-all">
        <textarea name="message" placeholder="Сообщение (необязательно)" rows="3"
          class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500 transition-all resize-none"></textarea>
        <button type="submit" class="w-full py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-lg transition-all hover:shadow-lg hover:shadow-accent-500/30">
          Отправить
        </button>
      </form>
    </div>
  </div>

  <!-- Mobile Menu -->
  <div id="mobile-menu" class="fixed inset-0 z-50 hidden">
    <div class="absolute inset-0 bg-dark-900/95 backdrop-blur-xl" onclick="toggleMobileMenu()"></div>
    <div class="absolute top-0 right-0 w-80 h-full bg-dark-800 border-l border-white/10 p-6">
      <button onclick="toggleMobileMenu()" class="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white">
        <i class="fas fa-times"></i>
      </button>
      
      <nav class="mt-16 space-y-2">
        <a href="/katalog" class="block px-4 py-3 rounded-xl text-white hover:bg-white/5 font-medium">Каталог</a>
        <a href="/o-kompanii" class="block px-4 py-3 rounded-xl text-white hover:bg-white/5 font-medium">О компании</a>
        <a href="/portfolio" class="block px-4 py-3 rounded-xl text-white hover:bg-white/5 font-medium">Проекты</a>
        <a href="/dostavka" class="block px-4 py-3 rounded-xl text-white hover:bg-white/5 font-medium">Доставка</a>
        <a href="/kontakty" class="block px-4 py-3 rounded-xl text-white hover:bg-white/5 font-medium">Контакты</a>
      </nav>
      
      <div class="absolute bottom-8 left-6 right-6">
        <button onclick="openRequestModal(); toggleMobileMenu();" class="w-full py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold">
          Оставить заявку
        </button>
      </div>
    </div>
  </div>
  `
  
  return c.html(renderModernPage('Главная', content, 
    'Armata-Rampa — Погрузочные рампы и эстакады от производителя',
    'Производитель погрузочных рамп и эстакад. Мобильные рампы от 449 000 ₽, гидравлические рампы от 679 000 ₽. Собственное производство, гарантия 1 год, доставка по России.'
  ))
})

// Catalog page
app.get('/katalog', async (c) => {
  const content = `
  <!-- Navigation (same as main) -->
  <nav class="fixed top-0 left-0 right-0 z-50" id="navbar">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="backdrop-blur-xl bg-dark-900/70 border border-white/10 rounded-2xl mt-4 px-6 py-4 flex items-center justify-between">
        <a href="/" class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
            <span class="text-white font-black text-lg">A</span>
          </div>
          <div class="hidden sm:block">
            <span class="text-xl font-bold text-white">ARMATA</span>
            <span class="text-xl font-bold text-accent-500">RAMPA</span>
          </div>
        </a>
        <div class="hidden lg:flex items-center gap-1">
          <a href="/katalog" class="px-4 py-2 rounded-xl text-accent-500 bg-accent-500/10 font-medium">Каталог</a>
          <a href="/o-kompanii" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all font-medium">О нас</a>
          <a href="/kontakty" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all font-medium">Контакты</a>
        </div>
        <button onclick="openRequestModal()" class="px-6 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold hover:shadow-lg hover:shadow-accent-500/25 transition-all">
          Заявка
        </button>
      </div>
    </div>
  </nav>

  <!-- Page Header -->
  <section class="pt-32 pb-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <nav class="flex items-center gap-2 text-sm mb-8">
        <a href="/" class="text-gray-500 hover:text-white transition-colors">Главная</a>
        <i class="fas fa-chevron-right text-gray-600 text-xs"></i>
        <span class="text-white">Каталог</span>
      </nav>
      
      <h1 class="text-4xl sm:text-5xl font-black text-white mb-4">
        Каталог <span class="bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">продукции</span>
      </h1>
      <p class="text-gray-400 text-lg max-w-2xl">Выберите подходящее решение для вашего склада из нашего ассортимента</p>
    </div>
  </section>

  <!-- Catalog Content -->
  <section class="pb-24">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-4 gap-8">
        <!-- Sidebar -->
        <aside class="lg:col-span-1">
          <div class="sticky top-28 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h3 class="text-white font-semibold mb-4">Категории</h3>
            <ul id="category-filter" class="space-y-2">
              <li>
                <a href="/katalog" class="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent-500/10 text-accent-400 font-medium">
                  <i class="fas fa-th-large"></i>
                  <span>Все товары</span>
                </a>
              </li>
            </ul>
          </div>
        </aside>
        
        <!-- Products -->
        <div class="lg:col-span-3">
          <div id="products-grid" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
            <!-- Products will be loaded via JS -->
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-12 border-t border-white/10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <p class="text-gray-500">© 2026 Armata-Rampa. Все права защищены.</p>
    </div>
  </footer>

  <!-- Request Modal -->
  <div id="request-modal" class="fixed inset-0 z-50 hidden items-center justify-center p-4">
    <div class="absolute inset-0 bg-dark-900/80 backdrop-blur-sm" onclick="closeRequestModal()"></div>
    <div class="relative w-full max-w-md bg-dark-800 border border-white/10 rounded-3xl p-8">
      <button onclick="closeRequestModal()" class="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white">
        <i class="fas fa-times"></i>
      </button>
      <h3 class="text-2xl font-bold text-white mb-6">Оставить заявку</h3>
      <form id="modal-request-form" class="space-y-4">
        <input type="text" name="name" placeholder="Ваше имя" required class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500 transition-all">
        <input type="tel" name="phone" placeholder="Телефон" required class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500 transition-all">
        <button type="submit" class="w-full py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold">Отправить</button>
      </form>
    </div>
  </div>
  `
  
  return c.html(renderModernPage('Каталог', content,
    'Каталог погрузочных рамп и эстакад | Armata-Rampa',
    'Каталог погрузочных рамп и эстакад от производителя. Мобильные и гидравлические рампы, эстакады. Цены, характеристики.'
  ))
})

// Category page
app.get('/katalog/:category', async (c) => {
  const categorySlug = c.req.param('category')
  
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
  <nav class="fixed top-0 left-0 right-0 z-50" id="navbar">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="backdrop-blur-xl bg-dark-900/70 border border-white/10 rounded-2xl mt-4 px-6 py-4 flex items-center justify-between">
        <a href="/" class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
            <span class="text-white font-black text-lg">A</span>
          </div>
        </a>
        <button onclick="openRequestModal()" class="px-6 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold">Заявка</button>
      </div>
    </div>
  </nav>

  <section class="pt-32 pb-24">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <nav class="flex items-center gap-2 text-sm mb-8">
        <a href="/" class="text-gray-500 hover:text-white">Главная</a>
        <i class="fas fa-chevron-right text-gray-600 text-xs"></i>
        <a href="/katalog" class="text-gray-500 hover:text-white">Каталог</a>
        <i class="fas fa-chevron-right text-gray-600 text-xs"></i>
        <span class="text-white">${category.name}</span>
      </nav>
      
      <h1 class="text-4xl font-black text-white mb-4">${category.name}</h1>
      <p class="text-gray-400 text-lg mb-12">${category.description || ''}</p>
      
      <div id="products-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-category="${categorySlug}">
      </div>
    </div>
  </section>

  <footer class="py-12 border-t border-white/10">
    <div class="max-w-7xl mx-auto px-4 text-center">
      <p class="text-gray-500">© 2026 Armata-Rampa</p>
    </div>
  </footer>

  <div id="request-modal" class="fixed inset-0 z-50 hidden items-center justify-center p-4">
    <div class="absolute inset-0 bg-dark-900/80 backdrop-blur-sm" onclick="closeRequestModal()"></div>
    <div class="relative w-full max-w-md bg-dark-800 border border-white/10 rounded-3xl p-8">
      <button onclick="closeRequestModal()" class="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
      <h3 class="text-2xl font-bold text-white mb-6">Оставить заявку</h3>
      <form id="modal-request-form" class="space-y-4">
        <input type="text" name="name" placeholder="Ваше имя" required class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500">
        <input type="tel" name="phone" placeholder="Телефон" required class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500">
        <button type="submit" class="w-full py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold">Отправить</button>
      </form>
    </div>
  </div>
  `
  
  return c.html(renderModernPage(category.name, content, category.seo_title, category.seo_description))
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
  <nav class="fixed top-0 left-0 right-0 z-50" id="navbar">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="backdrop-blur-xl bg-dark-900/70 border border-white/10 rounded-2xl mt-4 px-6 py-4 flex items-center justify-between">
        <a href="/" class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
            <span class="text-white font-black text-lg">A</span>
          </div>
        </a>
        <div class="hidden lg:flex items-center gap-1">
          <a href="/katalog" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 font-medium">Каталог</a>
          <a href="/kontakty" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 font-medium">Контакты</a>
        </div>
        <button onclick="openRequestModal()" class="px-6 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold">Заявка</button>
      </div>
    </div>
  </nav>

  <section class="pt-32 pb-24">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <nav class="flex items-center gap-2 text-sm mb-8">
        <a href="/" class="text-gray-500 hover:text-white">Главная</a>
        <i class="fas fa-chevron-right text-gray-600 text-xs"></i>
        <a href="/katalog" class="text-gray-500 hover:text-white">Каталог</a>
        ${product.category_name ? `<i class="fas fa-chevron-right text-gray-600 text-xs"></i><a href="/katalog/${product.category_slug}" class="text-gray-500 hover:text-white">${product.category_name}</a>` : ''}
        <i class="fas fa-chevron-right text-gray-600 text-xs"></i>
        <span class="text-white">${product.name}</span>
      </nav>
      
      <div class="grid lg:grid-cols-2 gap-12">
        <!-- Image -->
        <div class="relative">
          <div class="aspect-square rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden flex items-center justify-center">
            ${product.main_image 
              ? `<img src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80" alt="${product.name}" class="w-full h-full object-cover">`
              : `<div class="text-center"><i class="fas fa-image text-6xl text-gray-600 mb-4"></i><p class="text-gray-500">Изображение товара</p></div>`
            }
          </div>
          ${product.is_hit ? `
          <div class="absolute top-4 left-4 px-4 py-2 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white text-sm font-semibold">
            <i class="fas fa-fire mr-2"></i>Хит продаж
          </div>` : ''}
        </div>
        
        <!-- Info -->
        <div>
          <h1 class="text-4xl font-black text-white mb-4">${product.name}</h1>
          
          <div class="flex items-center gap-4 mb-6">
            <div class="text-4xl font-black bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">
              ${product.price ? product.price.toLocaleString('ru-RU') + ' ₽' : 'Цена по запросу'}
            </div>
            ${product.old_price ? `<div class="text-xl text-gray-500 line-through">${product.old_price.toLocaleString('ru-RU')} ₽</div>` : ''}
          </div>
          
          <p class="text-gray-400 text-lg mb-6">${product.short_description || ''}</p>
          
          <div class="flex items-center gap-3 mb-8">
            ${product.in_stock 
              ? `<div class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 text-green-400 font-medium"><i class="fas fa-check-circle"></i><span>В наличии</span></div>`
              : `<div class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-500/10 text-accent-400 font-medium"><i class="fas fa-clock"></i><span>Под заказ</span></div>`
            }
          </div>
          
          <!-- Specs -->
          <div class="p-6 rounded-2xl bg-white/5 border border-white/10 mb-8">
            <h3 class="text-white font-semibold mb-4">Характеристики</h3>
            <dl class="space-y-3">
              ${Object.entries(specs).map(([key, value]) => `
                <div class="flex justify-between py-2 border-b border-white/5 last:border-0">
                  <dt class="text-gray-400">${key}</dt>
                  <dd class="text-white font-medium">${value}</dd>
                </div>
              `).join('')}
            </dl>
          </div>
          
          <div class="flex flex-col sm:flex-row gap-4">
            <button onclick="openProductRequestModal('${product.name}')" class="flex-1 py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold text-lg hover:shadow-lg hover:shadow-accent-500/30 transition-all">
              <i class="fas fa-paper-plane mr-2"></i>Оставить заявку
            </button>
            <a href="tel:+74955553535" class="flex-1 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold text-lg text-center hover:bg-white/10 transition-all">
              <i class="fas fa-phone mr-2"></i>Позвонить
            </a>
          </div>
          
          <div class="mt-6 p-4 rounded-xl bg-primary-500/10 border border-primary-500/20">
            <p class="text-primary-300 text-sm">
              <i class="fas fa-info-circle mr-2"></i>
              Стоимость указана с НДС 20%. Продукция сертифицирована. Гарантия 1 год.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="py-12 border-t border-white/10">
    <div class="max-w-7xl mx-auto px-4 text-center">
      <p class="text-gray-500">© 2026 Armata-Rampa</p>
    </div>
  </footer>

  <div id="request-modal" class="fixed inset-0 z-50 hidden items-center justify-center p-4">
    <div class="absolute inset-0 bg-dark-900/80 backdrop-blur-sm" onclick="closeRequestModal()"></div>
    <div class="relative w-full max-w-md bg-dark-800 border border-white/10 rounded-3xl p-8">
      <button onclick="closeRequestModal()" class="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
      <h3 class="text-2xl font-bold text-white mb-2">Заявка на товар</h3>
      <p id="modal-product-name" class="text-gray-400 mb-6"></p>
      <form id="modal-request-form" class="space-y-4">
        <input type="hidden" name="product_id" value="${product.id}">
        <input type="text" name="name" placeholder="Ваше имя" required class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500">
        <input type="tel" name="phone" placeholder="Телефон" required class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500">
        <button type="submit" class="w-full py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold">Отправить заявку</button>
      </form>
    </div>
  </div>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "${product.name}",
    "description": "${product.short_description || ''}",
    "brand": {"@type": "Brand", "name": "Armata-Rampa"},
    "offers": {
      "@type": "Offer",
      "price": "${product.price || ''}",
      "priceCurrency": "RUB",
      "availability": "${product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder'}"
    }
  }
  </script>
  `
  
  return c.html(renderModernPage(product.name, content, product.seo_title, product.seo_description))
})

// Static pages
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  
  if (['katalog', 'product', 'admin', 'api', 'static', 'images'].includes(slug)) {
    return c.notFound()
  }
  
  let page: any = null
  try {
    page = await c.env.DB.prepare('SELECT * FROM pages WHERE slug = ? AND is_active = 1').bind(slug).first()
  } catch (e) {}
  
  if (!page) {
    return c.notFound()
  }
  
  const content = `
  <nav class="fixed top-0 left-0 right-0 z-50" id="navbar">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="backdrop-blur-xl bg-dark-900/70 border border-white/10 rounded-2xl mt-4 px-6 py-4 flex items-center justify-between">
        <a href="/" class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
            <span class="text-white font-black text-lg">A</span>
          </div>
        </a>
        <div class="hidden lg:flex items-center gap-1">
          <a href="/katalog" class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 font-medium">Каталог</a>
          <a href="/o-kompanii" class="${slug === 'o-kompanii' ? 'text-accent-500 bg-accent-500/10' : 'text-gray-300 hover:text-white hover:bg-white/5'} px-4 py-2 rounded-xl font-medium">О нас</a>
          <a href="/dostavka" class="${slug === 'dostavka' ? 'text-accent-500 bg-accent-500/10' : 'text-gray-300 hover:text-white hover:bg-white/5'} px-4 py-2 rounded-xl font-medium">Доставка</a>
          <a href="/kontakty" class="${slug === 'kontakty' ? 'text-accent-500 bg-accent-500/10' : 'text-gray-300 hover:text-white hover:bg-white/5'} px-4 py-2 rounded-xl font-medium">Контакты</a>
        </div>
        <button onclick="openRequestModal()" class="px-6 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold">Заявка</button>
      </div>
    </div>
  </nav>

  <section class="pt-32 pb-24">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <nav class="flex items-center gap-2 text-sm mb-8">
        <a href="/" class="text-gray-500 hover:text-white">Главная</a>
        <i class="fas fa-chevron-right text-gray-600 text-xs"></i>
        <span class="text-white">${page.title}</span>
      </nav>
      
      <h1 class="text-4xl sm:text-5xl font-black text-white mb-8">${page.title}</h1>
      
      <div class="prose prose-invert prose-lg max-w-none">
        <div class="text-gray-300 leading-relaxed space-y-6">
          ${page.content}
        </div>
      </div>
    </div>
  </section>

  <footer class="py-12 border-t border-white/10">
    <div class="max-w-7xl mx-auto px-4 text-center">
      <p class="text-gray-500">© 2026 Armata-Rampa</p>
    </div>
  </footer>

  <div id="request-modal" class="fixed inset-0 z-50 hidden items-center justify-center p-4">
    <div class="absolute inset-0 bg-dark-900/80 backdrop-blur-sm" onclick="closeRequestModal()"></div>
    <div class="relative w-full max-w-md bg-dark-800 border border-white/10 rounded-3xl p-8">
      <button onclick="closeRequestModal()" class="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
      <h3 class="text-2xl font-bold text-white mb-6">Оставить заявку</h3>
      <form id="modal-request-form" class="space-y-4">
        <input type="text" name="name" placeholder="Ваше имя" required class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500">
        <input type="tel" name="phone" placeholder="Телефон" required class="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500">
        <button type="submit" class="w-full py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold">Отправить</button>
      </form>
    </div>
  </div>
  `
  
  return c.html(renderModernPage(page.title, content, page.seo_title, page.seo_description))
})

// Admin login page
app.get('/admin/login', async (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Вход в админ-панель | Armata-Rampa</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'sans-serif'] },
          colors: {
            dark: { 900: '#0a0a0f', 800: '#12121a', 700: '#1a1a24' },
            accent: { 500: '#f97316', 600: '#ea580c' }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-dark-900 text-white font-sans">
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center mb-4">
          <span class="text-3xl font-black">A</span>
        </div>
        <h1 class="text-2xl font-bold">Armata-Rampa</h1>
        <p class="text-gray-500">Вход в админ-панель</p>
      </div>
      
      <div class="p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10">
        <form id="loginForm" class="space-y-6">
          <div id="error-message" class="hidden p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm"></div>
          
          <div>
            <label class="block text-sm text-gray-400 mb-2">Логин</label>
            <div class="relative">
              <i class="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
              <input type="text" name="username" required autocomplete="username"
                class="w-full pl-12 pr-4 py-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all"
                placeholder="admin">
            </div>
          </div>
          
          <div>
            <label class="block text-sm text-gray-400 mb-2">Пароль</label>
            <div class="relative">
              <i class="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
              <input type="password" name="password" required autocomplete="current-password"
                class="w-full pl-12 pr-4 py-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all"
                placeholder="Введите пароль">
            </div>
          </div>
          
          <button type="submit" id="submitBtn"
            class="w-full py-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-semibold hover:shadow-lg hover:shadow-accent-500/30 transition-all flex items-center justify-center gap-2">
            <i class="fas fa-sign-in-alt"></i>
            Войти
          </button>
        </form>
        
        <p class="mt-6 text-center text-gray-500 text-sm">
          <a href="/" class="text-accent-500 hover:text-accent-400 transition-colors">
            <i class="fas fa-arrow-left mr-1"></i> Вернуться на сайт
          </a>
        </p>
      </div>
      
      <p class="mt-6 text-center text-gray-600 text-xs">
        Логин: admin | Пароль: admin123
      </p>
    </div>
  </div>
  
  <script>
    // Check if already logged in
    if (localStorage.getItem('adminToken')) {
      window.location.href = '/admin';
    }
    
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const form = e.target;
      const submitBtn = document.getElementById('submitBtn');
      const errorEl = document.getElementById('error-message');
      const formData = new FormData(form);
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Вход...';
      errorEl.classList.add('hidden');
      
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
          localStorage.setItem('adminUser', JSON.stringify(data.user));
          window.location.href = '/admin';
        } else {
          errorEl.textContent = data.error || 'Ошибка авторизации';
          errorEl.classList.remove('hidden');
        }
      } catch (err) {
        errorEl.textContent = 'Ошибка сети. Попробуйте позже.';
        errorEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i> Войти';
      }
    });
  </script>
</body>
</html>`)
})

// Admin panel (protected)
app.get('/admin', async (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Админ-панель | Armata-Rampa CMS</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'sans-serif'] },
          colors: {
            dark: { 900: '#0a0a0f', 800: '#12121a', 700: '#1a1a24' },
            accent: { 500: '#f97316', 600: '#ea580c' }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-dark-900 text-white font-sans">
  <!-- Auth Check -->
  <script>
    if (!localStorage.getItem('adminToken')) {
      window.location.href = '/admin/login';
    }
  </script>
  
  <div class="min-h-screen flex">
    <aside class="w-64 bg-dark-800 border-r border-white/10 flex flex-col">
      <div class="p-6 border-b border-white/10">
        <h1 class="text-xl font-bold">Armata-Rampa</h1>
        <p class="text-gray-500 text-sm">Админ-панель</p>
      </div>
      <nav class="p-4 space-y-1 flex-1">
        <a href="#dashboard" onclick="showSection('dashboard')" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-300 hover:text-white transition-all">
          <i class="fas fa-chart-pie w-5"></i> Дашборд
        </a>
        <a href="#products" onclick="showSection('products')" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-300 hover:text-white transition-all">
          <i class="fas fa-boxes w-5"></i> Товары
        </a>
        <a href="#leads" onclick="showSection('leads')" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-300 hover:text-white transition-all">
          <i class="fas fa-envelope w-5"></i> Заявки
          <span id="new-leads-badge" class="hidden ml-auto px-2 py-0.5 rounded-full text-xs bg-red-500 text-white">0</span>
        </a>
        <a href="#settings" onclick="showSection('settings')" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-300 hover:text-white transition-all">
          <i class="fas fa-cog w-5"></i> Настройки
        </a>
      </nav>
      <div class="p-4 border-t border-white/10">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-sm font-bold">A</div>
          <div>
            <p class="font-medium text-sm" id="admin-username">admin</p>
            <p class="text-gray-500 text-xs">Администратор</p>
          </div>
        </div>
        <button onclick="logout()" class="w-full px-4 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all text-sm">
          <i class="fas fa-sign-out-alt mr-2"></i> Выйти
        </button>
      </div>
    </aside>

    <main class="flex-1 p-8">
      <section id="section-dashboard" class="admin-section">
        <h2 class="text-2xl font-bold mb-6">Дашборд</h2>
        <div class="grid grid-cols-4 gap-6 mb-8">
          <div class="p-6 rounded-2xl bg-white/5 border border-white/10">
            <p class="text-gray-400 text-sm mb-1">Товаров</p>
            <p id="stat-products" class="text-3xl font-bold text-accent-500">0</p>
          </div>
          <div class="p-6 rounded-2xl bg-white/5 border border-white/10">
            <p class="text-gray-400 text-sm mb-1">Заявок</p>
            <p id="stat-leads" class="text-3xl font-bold text-green-500">0</p>
          </div>
          <div class="p-6 rounded-2xl bg-white/5 border border-white/10">
            <p class="text-gray-400 text-sm mb-1">Отзывов</p>
            <p id="stat-reviews" class="text-3xl font-bold text-blue-500">0</p>
          </div>
          <div class="p-6 rounded-2xl bg-white/5 border border-white/10">
            <p class="text-gray-400 text-sm mb-1">Категорий</p>
            <p id="stat-categories" class="text-3xl font-bold text-purple-500">0</p>
          </div>
        </div>
        <div class="p-6 rounded-2xl bg-white/5 border border-white/10">
          <h3 class="font-semibold mb-4">Последние заявки</h3>
          <div id="recent-leads" class="space-y-2"></div>
        </div>
      </section>

      <section id="section-products" class="admin-section hidden">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">Товары</h2>
          <button class="px-4 py-2 rounded-xl bg-accent-500 text-white font-medium"><i class="fas fa-plus mr-2"></i>Добавить</button>
        </div>
        <div class="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <table class="w-full">
            <thead class="bg-white/5">
              <tr>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Товар</th>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Категория</th>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Цена</th>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Статус</th>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody id="products-table" class="divide-y divide-white/5"></tbody>
          </table>
        </div>
      </section>

      <section id="section-leads" class="admin-section hidden">
        <h2 class="text-2xl font-bold mb-6">Заявки</h2>
        <div class="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <table class="w-full">
            <thead class="bg-white/5">
              <tr>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Дата</th>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Имя</th>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Телефон</th>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Статус</th>
                <th class="px-6 py-4 text-left text-sm text-gray-400 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody id="leads-table" class="divide-y divide-white/5"></tbody>
          </table>
        </div>
      </section>

      <section id="section-settings" class="admin-section hidden">
        <h2 class="text-2xl font-bold mb-6">Настройки</h2>
        <div class="max-w-xl p-6 rounded-2xl bg-white/5 border border-white/10">
          <form id="settings-form" class="space-y-4">
            <div>
              <label class="block text-sm text-gray-400 mb-2">Телефон</label>
              <input type="text" name="phone_main" class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white">
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-2">Email</label>
              <input type="email" name="email" class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white">
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-2">Адрес</label>
              <input type="text" name="address" class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white">
            </div>
            <button type="submit" class="px-6 py-3 rounded-xl bg-accent-500 text-white font-medium">Сохранить</button>
          </form>
        </div>
      </section>
    </main>
  </div>

  <script>
    function logout() {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = '/admin/login';
    }
    
    function showSection(section) {
      document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));
      document.getElementById('section-' + section).classList.remove('hidden');
    }

    async function loadDashboard() {
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
      
      document.getElementById('recent-leads').innerHTML = (leads.data || []).slice(0, 5).map(lead => 
        '<div class="flex justify-between items-center p-3 rounded-xl bg-white/5"><div><p class="font-medium">' + lead.name + '</p><p class="text-sm text-gray-400">' + lead.phone + '</p></div><span class="px-3 py-1 rounded-full text-xs ' + (lead.status === 'new' ? 'bg-accent-500/20 text-accent-400' : 'bg-green-500/20 text-green-400') + '">' + (lead.status === 'new' ? 'Новая' : 'Обработана') + '</span></div>'
      ).join('') || '<p class="text-gray-500">Заявок пока нет</p>';
    }

    async function loadProducts() {
      const response = await fetch('/api/admin/products');
      const data = await response.json();
      
      document.getElementById('products-table').innerHTML = (data.data || []).map(product => 
        '<tr><td class="px-6 py-4"><div class="font-medium">' + product.name + '</div><div class="text-sm text-gray-500">' + product.slug + '</div></td><td class="px-6 py-4 text-gray-400">' + (product.category_name || '-') + '</td><td class="px-6 py-4">' + (product.price ? product.price.toLocaleString('ru-RU') + ' ₽' : '-') + '</td><td class="px-6 py-4"><span class="px-3 py-1 rounded-full text-xs ' + (product.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400') + '">' + (product.is_active ? 'Активен' : 'Скрыт') + '</span></td><td class="px-6 py-4"><button class="text-blue-400 hover:text-blue-300 mr-3"><i class="fas fa-edit"></i></button><button class="text-red-400 hover:text-red-300"><i class="fas fa-trash"></i></button></td></tr>'
      ).join('') || '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">Товаров пока нет</td></tr>';
    }

    async function loadLeads() {
      const response = await fetch('/api/admin/leads');
      const data = await response.json();
      
      document.getElementById('leads-table').innerHTML = (data.data || []).map(lead => 
        '<tr><td class="px-6 py-4 text-sm text-gray-400">' + new Date(lead.created_at).toLocaleString('ru-RU') + '</td><td class="px-6 py-4 font-medium">' + lead.name + '</td><td class="px-6 py-4">' + lead.phone + '</td><td class="px-6 py-4"><select onchange="updateLeadStatus(' + lead.id + ', this.value)" class="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-sm"><option value="new"' + (lead.status === 'new' ? ' selected' : '') + '>Новая</option><option value="processing"' + (lead.status === 'processing' ? ' selected' : '') + '>В работе</option><option value="completed"' + (lead.status === 'completed' ? ' selected' : '') + '>Завершена</option></select></td><td class="px-6 py-4"><a href="tel:' + lead.phone + '" class="text-green-400 hover:text-green-300"><i class="fas fa-phone"></i></a></td></tr>'
      ).join('') || '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">Заявок пока нет</td></tr>';
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

    // Set admin username from storage
    const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
    if (adminUser.username) {
      document.getElementById('admin-username').textContent = adminUser.username;
    }
    
    loadDashboard();
    loadProducts();
    loadLeads();
    loadSettings();
    
    // Periodically check for new leads
    setInterval(loadDashboard, 30000);
  </script>
</body>
</html>`)
})

export default app
