# Multi-stage build для оптимизации размера образа
FROM node:18-alpine AS builder

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Production образ
FROM node:18-alpine

WORKDIR /app

# Копируем package files и устанавливаем только production зависимости
COPY package*.json ./
RUN npm ci --only=production

# Копируем собранное приложение из builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Создаём директорию для uploads
RUN mkdir -p /app/public/uploads

# Expose порт
EXPOSE 3000

# Запуск приложения
CMD ["node", "dist/index.js"]
