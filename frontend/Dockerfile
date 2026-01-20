FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# Start development server (skip build step)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
