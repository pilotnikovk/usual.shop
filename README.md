# Armata-Rampa - Редизайн сайта с CMS

## Обзор проекта

**Название:** Armata-Rampa Redesign  
**Цель:** Современный, конверсионный сайт для производителя погрузочных рамп и эстакад с полнофункциональной CMS  
**Референс дизайна:** METALLURG (синий + оранжевый, промышленный стиль)

## Завершенные функции ✅

### Публичная часть сайта
- [x] Главная страница с hero-секцией, категориями, товарами, отзывами
- [x] Каталог товаров с фильтрацией по категориям
- [x] Карточки товаров с характеристиками и SEO-разметкой
- [x] Статические страницы (О компании, Доставка, Контакты)
- [x] Формы заявок с UTM-метками
- [x] Адаптивный дизайн (mobile-first)

### Админ-панель CMS
- [x] Дашборд со статистикой
- [x] Управление товарами (CRUD)
- [x] Управление заявками (CRM)
- [x] Настройки сайта
- [x] SEO-поля для всех сущностей

### SEO оптимизация
- [x] Семантическая HTML-структура
- [x] Мета-теги (title, description)
- [x] Schema.org микроразметка (Organization, Product)
- [x] SEO-дружественные URL
- [x] robots.txt

## URL-структура

| URL | Описание |
|-----|----------|
| `/` | Главная страница |
| `/katalog` | Каталог продукции |
| `/katalog/:category` | Категория товаров |
| `/product/:slug` | Карточка товара |
| `/o-kompanii` | О компании |
| `/dostavka` | Доставка и оплата |
| `/kontakty` | Контакты |
| `/admin` | Админ-панель |

## API Endpoints

### Публичные
- `GET /api/categories` - Категории
- `GET /api/products` - Товары
- `GET /api/products?category=slug` - Товары категории
- `GET /api/products/:slug` - Товар по slug
- `GET /api/reviews` - Отзывы
- `GET /api/faq` - FAQ
- `GET /api/settings` - Настройки
- `POST /api/leads` - Создание заявки

### Админ API
- `GET /api/admin/products` - Все товары
- `POST /api/admin/products` - Создать товар
- `PUT /api/admin/products/:id` - Обновить товар
- `DELETE /api/admin/products/:id` - Удалить товар
- `GET /api/admin/leads` - Все заявки
- `PUT /api/admin/leads/:id` - Обновить статус заявки
- `PUT /api/admin/settings` - Обновить настройки

## Модели данных

### Товар (Product)
```typescript
{
  id: number
  category_id: number
  slug: string           // SEO URL
  name: string
  short_description: string
  full_description: string
  price: number
  old_price?: number
  in_stock: boolean
  is_hit: boolean        // Хит продаж
  specifications: JSON   // Характеристики
  seo_title: string
  seo_description: string
  main_image: string
  images: string[]
}
```

### Заявка (Lead)
```typescript
{
  id: number
  name: string
  phone: string
  email?: string
  message?: string
  product_id?: number
  source: string         // Источник
  utm_source?: string    // UTM метки
  utm_medium?: string
  utm_campaign?: string
  status: 'new' | 'processing' | 'completed'
}
```

## Технологии

- **Backend:** Hono (TypeScript)
- **Database:** Cloudflare D1 (SQLite)
- **Frontend:** Tailwind CSS + Vanilla JS
- **Hosting:** Cloudflare Pages
- **CDN:** Cloudflare Edge Network

## Локальная разработка

```bash
# Установка зависимостей
npm install

# Сборка проекта
npm run build

# Применение миграций
npm run db:migrate:local

# Загрузка тестовых данных
npm run db:seed

# Запуск dev-сервера
npm run dev:sandbox

# Или через PM2
pm2 start ecosystem.config.cjs
```

## Деплой

```bash
# Сборка и деплой
npm run deploy:prod

# Миграции на продакшене (один раз)
npm run db:migrate:prod
```

## Не реализовано (следующие этапы)

- [ ] Аутентификация админки (JWT)
- [ ] Загрузка изображений (Cloudflare R2)
- [ ] WYSIWYG редактор страниц
- [ ] Email уведомления о заявках
- [ ] Telegram бот для заявок
- [ ] Интеграция с CRM (Битрикс24, AmoCRM)
- [ ] Расширенная аналитика
- [ ] Sitemap.xml генерация
- [ ] Полнотекстовый поиск

## Документация

- [План редизайна](./docs/REDESIGN_PLAN.md) - Wireframes, UI/UX, SEO
- [Архитектура CMS](./docs/CMS_ARCHITECTURE.md) - База данных, API, интеграции

## Статус развертывания

- **Платформа:** Cloudflare Pages
- **Статус:** ✅ Готово к развертыванию
- **Последнее обновление:** 2026-01-21
