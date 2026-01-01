FROM oven/bun:1 AS base
WORKDIR /app

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 \
    libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json bun.lockb* package-lock.json* ./
RUN bun install --frozen-lockfile || bun install

# Install Playwright browsers
RUN bunx playwright install chromium

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

CMD ["bun", "run", "src/index.ts"]
