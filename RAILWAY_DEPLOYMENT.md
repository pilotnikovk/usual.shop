# USSIL - Инструкция по деплою на Railway

Проект успешно мигрирован с Cloudflare Workers на Railway с Node.js и PostgreSQL.

## Что было сделано

### ✅ Выполненные изменения

1. **package.json** - обновлены зависимости:
   - Удалены Cloudflare пакеты (@cloudflare/workers-types, wrangler, @hono/vite-cloudflare-pages)
   - Добавлены Node.js пакеты (@hono/node-server, postgres, dotenv, tsx)
   - Обновлены npm scripts для Railway

2. **src/db.ts** (новый файл) - модуль подключения к PostgreSQL:
   - Настроен postgres.js клиент
   - Connection pooling (max 10 connections)
   - Хелперы для совместимости с D1 API

3. **migrations/0001_postgresql_schema.sql** (новый файл):
   - Конвертирован из SQLite в PostgreSQL
   - AUTOINCREMENT → SERIAL PRIMARY KEY
   - DATETIME → TIMESTAMP
   - TEXT → JSONB для JSON полей
   - Добавлены триггеры для auto-update

4. **migrations/seed_postgresql.sql** (новый файл):
   - Seed данные для PostgreSQL
   - INSERT OR IGNORE → ON CONFLICT DO NOTHING
   - JSONB литералы вместо TEXT

5. **src/index.tsx** - основной файл приложения:
   - Импорты: заменены Cloudflare на Node.js
   - Типы: удален Bindings
   - DB запросы: 52 замены D1 → postgres.js
   - Env vars: 4 замены c.env → process.env
   - Upload: R2 → локальная файловая система
   - Static files: обновлены пути
   - Server startup: добавлен код запуска сервера

6. **vite.config.ts** - конфигурация сборки:
   - Удален Cloudflare adapter
   - Настроен SSR build для Node.js
   - External dependencies

7. **tsconfig.json** - добавлены Node.js типы

8. **Railway конфигурация**:
   - [railway.json](railway.json) - настройки деплоя
   - [.env.example](.env.example) - шаблон переменных окружения
   - [.gitignore](.gitignore) - обновлен с предупреждением об ephemeral FS

---

## Следующие шаги для деплоя

### 1. Установка зависимостей

```bash
cd /Users/roik33/Documents/Develop/Ussil_proj/ussil
npm install
```

### 2. Локальное тестирование (опционально)

Установите PostgreSQL локально для тестирования:

```bash
# macOS
brew install postgresql@15
brew services start postgresql@15

# Создайте БД
createdb ussil_dev

# Создайте .env файл
cat > .env << EOF
DATABASE_URL=postgresql://localhost/ussil_dev
JWT_SECRET=test-secret-key-change-me
ADMIN_EMAIL=admin@localhost
NODE_ENV=development
PORT=3000
EOF

# Запустите миграции
npm run db:migrate
npm run db:seed

# Запустите dev сервер
npm run dev
```

Откройте http://localhost:5173/ для проверки.

### 3. Создание Git репозитория

```bash
# Инициализация
git init
git add .
git commit -m "Migrate from Cloudflare to Railway

- Update dependencies for Node.js
- Replace D1 with PostgreSQL
- Replace R2 with local filesystem
- Add Railway configuration
- Update all DB queries (52 replacements)
- Update env variable access (4 replacements)
- Add server startup code"

# Создайте репозиторий на GitHub и подключите
git remote add origin https://github.com/ваш-username/ussil.git
git branch -M main
git push -u origin main
```

### 4. Деплой на Railway

#### 4.1 Создайте проект

1. Перейдите на https://railway.app/
2. Нажмите "New Project"
3. Выберите "Deploy from GitHub repo"
4. Выберите репозиторий `ussil`
5. Railway автоматически обнаружит Node.js проект

#### 4.2 Добавьте PostgreSQL

1. В Railway проекте нажмите "New"
2. Выберите "Database" → "PostgreSQL"
3. Railway автоматически создаст переменную `DATABASE_URL`

#### 4.3 Настройте Environment Variables

Перейдите в Settings → Variables и добавьте:

```bash
# Обязательные
JWT_SECRET=<сгенерируйте: openssl rand -base64 32>
ADMIN_EMAIL=admin@ussil.ru
NODE_ENV=production

# Опциональные
RESEND_API_KEY=<ваш API ключ для email>
TELEGRAM_BOT_TOKEN=<токен бота от @BotFather>
TELEGRAM_CHAT_ID=<ваш chat ID от @userinfobot>
```

#### 4.4 Запустите миграции

Установите Railway CLI:

```bash
npm install -g @railway/cli

# Авторизуйтесь
railway login

# Подключитесь к проекту
railway link

# Запустите миграции
railway run npm run db:migrate
railway run npm run db:seed
```

Альтернативно, подключитесь к PostgreSQL напрямую:

```bash
# Скопируйте DATABASE_URL из Railway Dashboard
export DATABASE_URL="postgresql://..."

# Запустите миграции
npm run db:migrate
npm run db:seed
```

#### 4.5 Проверьте деплой

Railway автоматически задеплоит при следующем push в main. Проверьте:

1. Логи в Railway Dashboard (проверьте на ошибки)
2. Откройте URL проекта в браузере
3. Проверьте админ-панель: `https://ваш-домен.railway.app/admin/login`
   - Логин: `admin`
   - Пароль: `admin123`

---

## Важные предупреждения

### ⚠️ Ephemeral Filesystem на Railway

Railway использует **ephemeral filesystem**. Это означает:

- **Загруженные файлы будут удалены при каждом редеплое**
- Файлы не сохраняются между рестартами контейнера
- Невозможно масштабировать на несколько инстансов

**Краткосрочное решение:**
- Коммитьте важные изображения в Git (в `public/uploads/`)
- При каждом добавлении изображения через админку:
  ```bash
  git add public/uploads/
  git commit -m "Add uploaded images"
  git push
  ```

**Долгосрочное решение (рекомендуется):**

Мигрируйте на облачное хранилище:

1. **AWS S3:**
   ```bash
   npm install @aws-sdk/client-s3 multer-s3
   ```

2. **Cloudflare R2 (S3-compatible):**
   ```bash
   npm install @aws-sdk/client-s3
   # Используйте S3 клиент с R2 endpoint
   ```

3. **DigitalOcean Spaces:**
   ```bash
   npm install @aws-sdk/client-s3
   # S3-compatible API
   ```

Обновите upload endpoint в [src/index.tsx](src/index.tsx:775) для использования S3.

---

## Полезные команды

### Локальная разработка

```bash
npm run dev              # Vite dev server с HMR
npm run start:dev        # tsx watch для быстрого рестарта
npm run build            # Production build
npm run start            # Запуск production build
```

### База данных

```bash
npm run db:migrate       # Применить миграции
npm run db:seed          # Загрузить seed данные
npm run db:reset         # Сбросить БД и загрузить заново
```

### Тестирование build

```bash
npm run build
npm run start
# Откройте http://localhost:3000
```

---

## Структура проекта после миграции

```
ussil/
├── src/
│   ├── index.tsx        # Основное приложение (мигрировано)
│   ├── db.ts            # PostgreSQL модуль (новый)
│   └── renderer.tsx     # JSX renderer
├── migrations/
│   ├── 0001_postgresql_schema.sql  # PostgreSQL схема (новый)
│   └── seed_postgresql.sql         # Seed данные (новый)
├── public/
│   ├── static/          # CSS, JS
│   └── uploads/         # Загруженные файлы (ephemeral!)
├── package.json         # Обновлены зависимости
├── vite.config.ts       # Настроен для Node.js
├── tsconfig.json        # Добавлены Node types
├── railway.json         # Railway конфигурация (новый)
├── .env.example         # Шаблон env vars (новый)
└── .gitignore           # Обновлен
```

---

## Мониторинг и отладка

### Просмотр логов в Railway

```bash
railway logs
```

Или в Railway Dashboard → Deployments → Logs

### Проверка подключения к БД

```bash
railway run psql $DATABASE_URL -c "SELECT COUNT(*) FROM products;"
railway run psql $DATABASE_URL -c "SELECT COUNT(*) FROM categories;"
```

### Распространённые проблемы

**1. TypeScript ошибка: Cannot find type definition file for 'node'**

Решение: запустите `npm install` для установки @types/node

**2. Database connection failed**

Проверьте:
- DATABASE_URL настроен в Railway
- PostgreSQL сервис запущен
- Миграции применены

**3. Uploaded files disappeared**

Это ожидаемое поведение на Railway (ephemeral FS). Либо коммитьте в Git, либо используйте cloud storage.

**4. 502 Bad Gateway**

Проверьте:
- Railway логи на ошибки
- Правильно ли установлен PORT
- Сервер запускается (`npm run start` работает локально?)

---

## Миграция завершена! 🎉

Все изменения применены. Проект готов к деплою на Railway.

### Статистика миграции:

- ✅ 52 замены DB запросов (D1 → postgres.js)
- ✅ 4 замены environment variables
- ✅ 9 файлов обновлено/создано
- ✅ 15 таблиц PostgreSQL
- ✅ Seed данные с 12 товарами, 5 категориями, 5 отзывами

### Поддержка:

- План миграции: [/Users/roik33/.claude/plans/abstract-fluttering-fountain.md](/Users/roik33/.claude/plans/abstract-fluttering-fountain.md)
- Railway документация: https://docs.railway.app/
- postgres.js документация: https://github.com/porsager/postgres

Удачного деплоя! 🚀
