# Архитектура CMS Armata-Rampa

## 1. Обзор системы

### 1.1 Технологический стек
- **Backend:** Hono (TypeScript) на Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Frontend:** Tailwind CSS + Vanilla JS
- **CDN:** Cloudflare Pages
- **Хостинг:** Cloudflare Edge Network

### 1.2 Преимущества архитектуры
- ✅ Глобальная доступность (Edge-сеть)
- ✅ Автоматическое масштабирование
- ✅ Низкая задержка (< 50ms)
- ✅ Встроенный SSL/HTTPS
- ✅ DDoS защита
- ✅ Низкая стоимость хостинга

---

## 2. Структура базы данных

### 2.1 Основные таблицы

```sql
-- Категории товаров
categories (
  id, slug, name, description,
  seo_title, seo_description, seo_keywords,
  image_url, sort_order, is_active,
  created_at, updated_at
)

-- Товары
products (
  id, category_id, slug, name,
  short_description, full_description,
  price, old_price, currency, in_stock,
  is_hit, is_new, is_sale,
  specifications (JSON),
  seo_title, seo_description, seo_keywords,
  images (JSON), main_image,
  sort_order, is_active, views_count,
  created_at, updated_at
)

-- Атрибуты товаров
product_attributes (
  id, product_id, attribute_name,
  attribute_value, unit, sort_order
)

-- Портфолио
portfolio (
  id, title, description,
  client_name, location, completion_date,
  images (JSON), main_image,
  sort_order, is_active, created_at
)

-- Отзывы
reviews (
  id, client_name, client_company,
  client_position, client_photo,
  rating, review_text,
  product_id, is_approved, is_active,
  created_at
)

-- FAQ
faq (
  id, question, answer,
  category, sort_order, is_active,
  created_at
)

-- Статические страницы
pages (
  id, slug, title, content,
  seo_title, seo_description, seo_keywords,
  template, is_active,
  created_at, updated_at
)

-- Новости / Блог
news (
  id, slug, title, excerpt, content,
  main_image, seo_title, seo_description,
  author, is_published, published_at,
  created_at, updated_at
)

-- Заявки (Лиды)
leads (
  id, name, phone, email, company,
  message, product_id, source,
  utm_source, utm_medium, utm_campaign,
  status, notes,
  created_at, processed_at
)

-- Настройки сайта
settings (
  id, key, value, type, description,
  updated_at
)

-- Пользователи админки
admin_users (
  id, username, password_hash, email,
  role, is_active, last_login, created_at
)

-- Сессии
admin_sessions (
  id, user_id, token, expires_at, created_at
)
```

### 2.2 Связи между таблицами

```
categories ──┬── products
             │      │
             │      ├── product_attributes
             │      │
             │      └── leads
             │             │
reviews ─────┼─────────────┘
             │
pages        │
             │
news         │
             │
portfolio    │
             │
faq          │
             │
settings     │
             │
admin_users ─┴── admin_sessions
```

---

## 3. API Endpoints

### 3.1 Публичный API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/categories` | Список категорий |
| GET | `/api/products` | Список товаров |
| GET | `/api/products?category=slug` | Товары по категории |
| GET | `/api/products/:slug` | Один товар |
| GET | `/api/reviews` | Отзывы |
| GET | `/api/faq` | FAQ |
| GET | `/api/portfolio` | Портфолио |
| GET | `/api/pages/:slug` | Страница |
| GET | `/api/settings` | Настройки |
| POST | `/api/leads` | Создание заявки |

### 3.2 Админ API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/products` | Все товары |
| POST | `/api/admin/products` | Создать товар |
| PUT | `/api/admin/products/:id` | Обновить товар |
| DELETE | `/api/admin/products/:id` | Удалить товар |
| GET | `/api/admin/leads` | Все заявки |
| PUT | `/api/admin/leads/:id` | Обновить заявку |
| PUT | `/api/admin/settings` | Обновить настройки |

---

## 4. Функции админ-панели

### 4.1 Дашборд
- Статистика: товаров, заявок, отзывов
- Последние заявки
- Быстрые действия

### 4.2 Управление товарами
- CRUD операции
- Массовое редактирование
- Сортировка drag-and-drop
- Фильтры по категории/статусу
- Редактор характеристик (JSON)
- Загрузка изображений
- SEO поля

### 4.3 Управление категориями
- CRUD операции
- Иерархия категорий
- SEO настройки

### 4.4 Управление заявками (CRM)
- Список заявок с фильтрами
- Статусы: новая → в работе → завершена
- Заметки менеджера
- Экспорт в CSV
- Уведомления (email/telegram)

### 4.5 Управление контентом
- Редактор страниц (WYSIWYG)
- Портфолио
- Отзывы (модерация)
- FAQ
- Новости/блог

### 4.6 Настройки
- Контактная информация
- Режим работы
- Соцсети
- SEO глобальные настройки
- Аналитика (ID метрик)

---

## 5. Безопасность

### 5.1 Аутентификация админки
- JWT токены
- Сессии с истечением
- Rate limiting
- Защита от CSRF

### 5.2 Валидация данных
- Серверная валидация всех входных данных
- Санитизация HTML контента
- Prepared statements для SQL

### 5.3 Защита API
- CORS настройки
- Rate limiting для публичного API
- Защита админ роутов

---

## 6. Интеграции

### 6.1 Аналитика
- Google Analytics 4
- Яндекс.Метрика
- Отслеживание целей/конверсий

### 6.2 CRM интеграции (планируется)
- Битрикс24
- AmoCRM
- Webhook уведомления

### 6.3 Уведомления (планируется)
- Email (SendGrid/Mailgun)
- Telegram бот
- SMS (SMSC.ru)

---

## 7. Масштабирование

### 7.1 Текущие лимиты Cloudflare Workers
- 10ms CPU time (бесплатно)
- 30ms CPU time (платно)
- 128MB RAM
- 10MB размер бандла

### 7.2 Рекомендации по масштабированию
- Кэширование статического контента
- CDN для изображений
- Оптимизация запросов к D1
- Индексы на часто используемых полях

---

## 8. Развертывание

### 8.1 Локальная разработка
```bash
npm run build
npm run dev:sandbox  # или dev:d1 для работы с БД
```

### 8.2 Миграции БД
```bash
npm run db:migrate:local  # Локально
npm run db:migrate:prod   # Продакшн
npm run db:seed           # Тестовые данные
```

### 8.3 Деплой на Cloudflare
```bash
npm run deploy:prod
```

---

## 9. Мониторинг

### 9.1 Cloudflare Analytics
- Запросы и ответы
- Ошибки и их частота
- Географическое распределение
- Производительность (latency)

### 9.2 Логирование
- Ошибки в console.error
- Cloudflare Workers Logs
- Логи заявок в БД

---

## 10. Roadmap развития

### Фаза 1 (MVP) ✅
- [x] Базовая структура сайта
- [x] Каталог товаров
- [x] Формы заявок
- [x] Админ-панель базовая

### Фаза 2 (v1.1)
- [ ] Аутентификация админки
- [ ] Загрузка изображений (R2)
- [ ] WYSIWYG редактор
- [ ] Email уведомления

### Фаза 3 (v1.2)
- [ ] CRM интеграции
- [ ] Telegram бот для заявок
- [ ] Расширенная аналитика
- [ ] A/B тестирование

### Фаза 4 (v2.0)
- [ ] Личный кабинет клиентов
- [ ] Онлайн калькулятор
- [ ] Конфигуратор рамп
- [ ] Интеграция с 1С
