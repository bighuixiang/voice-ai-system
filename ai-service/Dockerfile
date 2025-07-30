# Python AI Service Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user early
RUN useradd --create-home --shell /bin/bash --uid 1001 app

# Copy requirements first for better caching
COPY requirements.txt .

# Upgrade pip and install Python dependencies with optimizations
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt && \
    pip cache purge

# Copy application code
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p /app/models /app/vector_db /app/logs /app/temp && \
    chown -R app:app /app

# Switch to non-root user
USER app

# Set Python environment variables for better performance
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Expose port
EXPOSE 8000

# Health check with improved configuration
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start the application with uvicorn for better performance
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]