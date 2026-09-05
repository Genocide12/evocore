# EvoCore — Node.js dashboard + Python evolution engine in one image.
# The engine uses ONLY the Python standard library, so no pip packages needed.
FROM node:20-slim

# python3 = runtime of the self-evolving engine
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install

# Copy the rest and build
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

# Standalone Next.js server; API routes spawn `python3 evolution/evolution_core.py`
CMD ["node", ".next/standalone/server.js"]
