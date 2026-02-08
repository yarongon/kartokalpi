# Development Dockerfile for Karto-Kalpi
# This container includes both Python backend and Node.js for React frontend

FROM python:3.13-slim

# Install Node.js
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install uv for Python package management
RUN pip install --no-cache-dir uv

# Copy data files
# COPY data/ ./data/

# Install Python dependencies using uv
# COPY pyproject.toml uv.lock* ./
# RUN uv sync

# Install frontend dependencies
# COPY package.json package-lock.json* ./
# RUN npm install

# Copy source code
# COPY src/ ./src/
# COPY tests/ ./tests/

# Expose ports
# 3000 for React dev server
# 8000 for Python backend (FastAPI/Flask)
EXPOSE 3000 8000

# Default command for development
CMD ["bash"]
