# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# VITE_API_BASE_URL is a build-time variable (replaced at compile time by Vite).
# Override at docker build time with: --build-arg VITE_API_BASE_URL=https://your-backend
ARG VITE_API_BASE_URL=http://localhost:8000/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve via nginx (non-root, no node_modules in runtime image)
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
