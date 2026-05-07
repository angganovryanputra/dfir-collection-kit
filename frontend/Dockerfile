# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# VITE_API_BASE_URL is a build-time variable (replaced at compile time by Vite).
# Override at docker build time with: --build-arg VITE_API_BASE_URL=https://your-backend
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve via nginx (non-root, no node_modules in runtime image)
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Pre-create nginx temp/log dirs owned by nginx (uid 101) so nginx can start
# without chown at runtime — required when cap_drop: ALL blocks privilege ops.
# Also strip the global `user` directive since setuid() needs CAP_SETUID.
RUN mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp \
    && chown -R nginx:nginx \
         /var/cache/nginx \
         /var/log/nginx \
         /usr/share/nginx/html \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid \
    && sed -i 's/^user\s.*;$/# user directive removed for unprivileged run/' /etc/nginx/nginx.conf

USER nginx
EXPOSE 80
