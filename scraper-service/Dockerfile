FROM node:18-slim

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
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
    libgcc1 \
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
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./

# Create non-root user for security (before installing dependencies)
RUN if id -u scraper >/dev/null 2>&1; then \
      echo "User scraper already exists"; \
    else \
      useradd -m scraper; \
    fi

# Install dependencies (use npm install since we don't have package-lock.json)
# For production, omit dev dependencies
# Puppeteer will download Chrome automatically
RUN npm install --omit=dev

# Switch to scraper user to install Chrome in their home directory
USER scraper

# Install Chrome via Puppeteer (as scraper user, so it goes to /home/scraper/.cache/puppeteer)
RUN npx puppeteer browsers install chrome

# Switch back to root to copy files and set permissions
USER root

# Copy application code and set permissions
COPY server.js ./
RUN chown -R scraper:scraper /app

# Switch back to scraper user for runtime
USER scraper

EXPOSE 3000

CMD ["node", "server.js"]

