#!/bin/bash

# Docker Optimization Script for Voice AI Decision System
set -e

echo "🚀 Starting Docker optimization..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

# Clean up old containers and images
print_status "Cleaning up old Docker resources..."
docker system prune -f
docker volume prune -f

# Remove dangling images
print_status "Removing dangling images..."
docker image prune -f

# Build optimized images
print_status "Building optimized Docker images..."

# Build API service with build cache
print_status "Building API service..."
docker build \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --cache-from voice-ai-api:latest \
    -t voice-ai-api:latest \
    -f api/Dockerfile \
    ./api

# Build AI service with build cache
print_status "Building AI service..."
docker build \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --cache-from voice-ai-python:latest \
    -t voice-ai-python:latest \
    -f ai-service/Dockerfile \
    ./ai-service

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p models api/uploads api/knowledge ai-service/vector_db

# Set proper permissions
print_status "Setting proper permissions..."
chmod 755 models api/uploads api/knowledge ai-service/vector_db

# Optimize Docker daemon settings
print_status "Checking Docker daemon configuration..."
if [ -f /etc/docker/daemon.json ]; then
    print_warning "Docker daemon.json exists. Please manually verify optimization settings."
else
    print_status "Creating optimized Docker daemon configuration..."
    sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ],
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  }
}
EOF
    print_warning "Docker daemon configuration updated. Please restart Docker daemon."
fi

# Display image sizes
print_status "Docker image sizes:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "(voice-ai|REPOSITORY)"

# Display system info
print_status "Docker system information:"
docker system df

print_status "✅ Docker optimization completed!"
print_status "To start the optimized services, run:"
print_status "  docker-compose up -d"
print_status "For production deployment, run:"
print_status "  docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d"