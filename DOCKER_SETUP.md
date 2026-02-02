# USSIL - Docker Setup

Простой способ запустить проект локально с PostgreSQL в Docker.

## Быстрый старт

### Вариант 1: Production режим (полная сборка)

```bash
# 1. Запустите PostgreSQL и приложение
docker-compose up -d

# 2. Примените миграции (первый запуск)
docker-compose exec postgres psql -U ussil -d ussil_db -f /docker-entrypoint-initdb.d/0001_postgresql_schema.sql
docker-compose exec postgres psql -U ussil -d ussil_db -f /docker-entrypoint-initdb.d/seed_postgresql.sql

# 3. Откройте браузер
# http://localhost:3000
```

### Вариант 2: Development режим (только PostgreSQL в Docker)

Этот вариант **рекомендуется для разработки** - PostgreSQL в Docker, приложение локально с hot reload.

```bash
# 1. Запустите только PostgreSQL
docker-compose -f docker-compose.dev.yml up -d

# 2. Создайте .env файл
cat > .env << 'EOF'
DATABASE_URL=postgresql://ussil:ussil_dev_password@localhost:5433/ussil_dev
JWT_SECRET=local-dev-secret-key
ADMIN_EMAIL=admin@localhost
NODE_ENV=development
PORT=3000
EOF

# 3. Примените миграции
npm run db:migrate
npm run db:seed

# 4. Запустите приложение локально с HMR
npm install
npm run dev
```

Откройте:
- **Приложение:** http://localhost:5173 (Vite dev server)
- **Adminer (PostgreSQL UI):** http://localhost:8080
  - Система: `PostgreSQL`
  - Сервер: `postgres`
  - Пользователь: `ussil`
  - Пароль: `ussil_dev_password`
  - База данных: `ussil_dev`

## Доступ к админ-панели

После запуска:
- **URL:** http://localhost:3000/admin/login (production) или http://localhost:5173/admin/login (dev)
- **Логин:** `admin`
- **Пароль:** `admin123`

## Управление контейнерами

### Основные команды

```bash
# Запустить контейнеры
docker-compose up -d

# Остановить контейнеры
docker-compose down

# Остановить и удалить данные (!)
docker-compose down -v

# Посмотреть логи
docker-compose logs -f app
docker-compose logs -f postgres

# Перезапустить приложение
docker-compose restart app

# Пересобрать приложение
docker-compose up -d --build
```

### Работа с базой данных

```bash
# Подключиться к PostgreSQL
docker-compose exec postgres psql -U ussil -d ussil_db

# Выполнить SQL команду
docker-compose exec postgres psql -U ussil -d ussil_db -c "SELECT COUNT(*) FROM products;"

# Создать backup
docker-compose exec postgres pg_dump -U ussil ussil_db > backup.sql

# Восстановить из backup
docker-compose exec -T postgres psql -U ussil -d ussil_db < backup.sql

# Применить миграции заново
docker-compose exec postgres psql -U ussil -d ussil_db -f /docker-entrypoint-initdb.d/0001_postgresql_schema.sql
```

## Структура файлов

```
ussil/
├── Dockerfile                  # Образ приложения
├── docker-compose.yml          # Production setup (app + PostgreSQL)
├── docker-compose.dev.yml      # Development setup (только PostgreSQL + Adminer)
├── .dockerignore              # Исключения для Docker build
└── DOCKER_SETUP.md            # Эта инструкция
```

## Преимущества Docker setup

✅ **Простой старт** - одна команда для запуска всего
✅ **Изолированная среда** - не засоряет систему
✅ **PostgreSQL в контейнере** - не нужно устанавливать локально
✅ **Adminer включён** - удобный веб-интерфейс для БД
✅ **Персистентные данные** - volumes сохраняют БД и uploads
✅ **Hot reload в dev режиме** - изменения кода применяются мгновенно

## Переменные окружения

### Production (docker-compose.yml)

Настраиваются в секции `environment` сервиса `app`:
- `DATABASE_URL` - автоматически настроен для PostgreSQL в Docker
- `JWT_SECRET` - смените в production!
- `ADMIN_EMAIL` - email администратора
- `NODE_ENV=production`

### Development (локально с .env)

Создайте файл `.env`:
```env
DATABASE_URL=postgresql://ussil:ussil_dev_password@localhost:5433/ussil_dev
JWT_SECRET=local-dev-secret-key
ADMIN_EMAIL=admin@localhost
NODE_ENV=development
```

## Troubleshooting

### Порт 5433 уже занят

Если у вас уже запущен локальный PostgreSQL:

```bash
# Остановите локальный PostgreSQL (macOS)
brew services stop postgresql@15

# Или измените порт в docker-compose.dev.yml
ports:
  - "5433:5432"  # Используйте 5433 снаружи

# Не забудьте обновить DATABASE_URL
DATABASE_URL=postgresql://ussil:ussil_dev_password@localhost:5433/ussil_dev
```

### Контейнер app падает

```bash
# Проверьте логи
docker-compose logs app

# Убедитесь, что PostgreSQL запущен
docker-compose ps

# Пересоберите образ
docker-compose up -d --build
```

### База данных пустая

```bash
# Примените миграции вручную
docker-compose exec postgres psql -U ussil -d ussil_db -f /docker-entrypoint-initdb.d/0001_postgresql_schema.sql
docker-compose exec postgres psql -U ussil -d ussil_db -f /docker-entrypoint-initdb.d/seed_postgresql.sql
```

### Сбросить всё и начать заново

```bash
# Удалить всё (включая данные!)
docker-compose down -v

# Запустить заново
docker-compose up -d

# Применить миграции
docker-compose exec postgres psql -U ussil -d ussil_db -f /docker-entrypoint-initdb.d/0001_postgresql_schema.sql
docker-compose exec postgres psql -U ussil -d ussil_db -f /docker-entrypoint-initdb.d/seed_postgresql.sql
```

## Для Railway деплоя

Docker образ совместим с Railway! Просто используйте `Dockerfile`:

1. Railway автоматически обнаружит Dockerfile
2. PostgreSQL добавляйте как отдельный сервис Railway
3. Railway сам установит `DATABASE_URL`

## Рекомендуемый workflow

**Разработка:**
```bash
docker-compose -f docker-compose.dev.yml up -d  # PostgreSQL + Adminer
npm run dev                                      # Приложение локально
```

**Тестирование production build:**
```bash
docker-compose up -d --build
```

**Деплой на Railway:**
- Используйте Dockerfile
- PostgreSQL как отдельный сервис

Удачи! 🐳
