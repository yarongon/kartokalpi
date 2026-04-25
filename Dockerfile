# Development Dockerfile for Karto-Kalpi
# This container includes both Python backend and Node.js for React frontend

FROM python:3.13-slim

# Install Node.js and npm
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs npm \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install uv for Python package management
RUN pip install --no-cache-dir uv

# Copy Python dependency files
COPY pyproject.toml ./

# Install Python dependencies using uv
RUN uv sync

# Copy data files
COPY data/ ./data/

# Copy backend source code
COPY src/backend/ ./src/backend/

# Install frontend dependencies
COPY src/frontend/package.json src/frontend/package-lock.json* ./src/frontend/
WORKDIR /app/src/frontend
RUN npm install

# Copy frontend source
COPY src/frontend/ ./

# Build frontend for production
RUN npm run build

# Back to app directory
WORKDIR /app

# Expose ports
# 8000 for Python backend (FastAPI)
# 3000 for React frontend development server (if running in dev mode)
EXPOSE 8000 3000

# Copy startup script that runs the backend
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Default command - runs backend server
CMD ["/app/start.sh"]
