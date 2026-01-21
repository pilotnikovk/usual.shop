# Armata-Rampa - Редизайн сайта с CMS (2026)

## Обзор проекта

**Название:** Armata-Rampa Redesign  
**Цель:** Современный, конверсионный сайт для производителя погрузочных рамп и эстакад с полнофункциональной CMS  
**Дизайн:** Современный dark mode 2026 с glassmorphism эффектами и анимациями

## Публичные URL

- **Sandbox:** https://3000-iazsysmuqv9mw8zvmcg5e-18e660f9.sandbox.novita.ai
- **Админ-панель:** https://3000-iazsysmuqv9mw8zvmcg5e-18e660f9.sandbox.novita.ai/admin/login
- **Логин/Пароль:** admin / admin123

## Завершенные функции

### Публичная часть сайта
- [x] Главная страница с hero-секцией, категориями, товарами, отзывами
- [x] Каталог товаров с фильтрацией по категориям
- [x] Карточки товаров с характеристиками и SEO-разметкой
- [x] Статические страницы (О компании, Доставка, Контакты)
- [x] Формы заявок с UTM-метками
- [x] Адаптивный дизайн (mobile-first)
- [x] Современный дизайн 2026 (dark mode, glassmorphism, анимации)
- [x] Реальные изображения товаров

### Админ-панель CMS
- [x] Страница входа с JWT-аутентификацией
- [x] Дашборд со статистикой
- [x] Управление товарами (CRUD)
- [x] Управление заявками (CRM)
- [x] Настройки сайта
- [x] SEO-поля для всех сущностей

### Безопасность
- [x] JWT-аутентификация для админки
- [x] Хеширование паролей (SHA-256)
- [x] Защита роутов админки

### Email уведомления
- [x] Интеграция с Resend API
- [x] Уведомления о новых заявках на email администратора

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
| `/admin/login` | Вход в админ-панель |
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

### Аутентификация
- `POST /api/admin/login` - Вход (возвращает JWT токен)
- `GET /api/admin/verify` - Проверка токена
- `GET /api/admin/stats` - Статистика дашборда
- `POST /api/admin/change-password` - Смена пароля

### Админ API
- `GET /api/admin/products` - Все товары
- `POST /api/admin/products` - Создать товар
- `PUT /api/admin/products/:id` - Обновить товар
- `DELETE /api/admin/products/:id` - Удалить товар
- `GET /api/admin/leads` - Все заявки
- `PUT /api/admin/leads/:id` - Обновить статус заявки
- `PUT /api/admin/settings` - Обновить настройки

## Данные для входа в админку

- **Логин:** admin
- **Пароль:** admin123

**Рекомендуется сменить пароль после первого входа!**

## Технологии

- **Backend:** Hono (TypeScript)
- **Database:** Cloudflare D1 (SQLite)
- **Frontend:** Tailwind CSS + Vanilla JS
- **Дизайн:** Dark mode, Glassmorphism, CSS анимации
- **Шрифт:** Inter
- **Хостинг:** Cloudflare Pages
- **Email:** Resend API
- **Аутентификация:** JWT (Web Crypto API)

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

## Конфигурация

### Environment Variables

Для локальной разработки создайте файл `.dev.vars`:

```
JWT_SECRET=your-secret-key-change-in-production
RESEND_API_KEY=your-resend-api-key
ADMIN_EMAIL=admin@example.com
```

Для продакшена установите секреты через wrangler:

```bash
npx wrangler pages secret put JWT_SECRET --project-name armata-rampa
npx wrangler pages secret put RESEND_API_KEY --project-name armata-rampa
npx wrangler pages secret put ADMIN_EMAIL --project-name armata-rampa
```

## Деплой на Cloudflare

```bash
# 1. Создать D1 базу
npx wrangler d1 create armata-rampa-production

# 2. Обновить database_id в wrangler.jsonc

# 3. Применить миграции
npm run db:migrate:prod

# 4. Загрузить начальные данные
npx wrangler d1 execute armata-rampa-production --file=./seed.sql

# 5. Сборка и деплой
npm run deploy:prod
```

## Следующие шаги

- [ ] Создать D1 базу на Cloudflare Dashboard
- [ ] Настроить Resend API для email уведомлений
- [ ] Загрузка изображений (Cloudflare R2)
- [ ] WYSIWYG редактор страниц
- [ ] Telegram бот для заявок
- [ ] Интеграция с CRM (Битрикс24, AmoCRM)
- [ ] Sitemap.xml автогенерация
- [ ] Полнотекстовый поиск

## Документация

- [План редизайна](./docs/REDESIGN_PLAN.md) - Wireframes, UI/UX, SEO
- [Архитектура CMS](./docs/CMS_ARCHITECTURE.md) - База данных, API, интеграции

## Статус развертывания

- **Платформа:** Cloudflare Pages
- **Статус:** Готово к развертыванию
- **Последнее обновление:** 2026-01-21
- **Версия дизайна:** 2026 Dark Mode
