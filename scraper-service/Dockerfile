# Yellow Sticker scraper worker
# Targets amd64 (Intel Mac mini running Docker Desktop).
FROM node:20-slim

# Chromium runtime deps for Puppeteer headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    tzdata \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first so subsequent source-only changes don't bust this layer.
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Create a non-root user and move the Puppeteer cache into a predictable location
# so the Chromium install is owned by the same user that runs the process.
RUN useradd --create-home --shell /bin/bash scraper \
  && mkdir -p /home/scraper/.cache \
  && chown -R scraper:scraper /app /home/scraper

USER scraper
# Download the Chromium build that matches the installed Puppeteer version.
RUN npx puppeteer browsers install chrome

USER root
COPY --chown=scraper:scraper src ./src
USER scraper

ENV NODE_ENV=production \
    TZ=Europe/London \
    HEALTH_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=1m --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
