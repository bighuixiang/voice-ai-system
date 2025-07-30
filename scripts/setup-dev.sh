#!/bin/bash

# Voice AI Decision System - Development Setup Script

echo "🔧 Setting up Voice AI Decision System Development Environment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create environment files from examples
echo "📄 Creating environment files..."

if [ ! -f api/.env ]; then
    cp api/.env.example api/.env
    echo "✅ Created api/.env from example"
else
    echo "ℹ️  api/.env already exists"
fi

if [ ! -f ai-service/.env ]; then
    cp ai-service/.env.example ai-service/.env
    echo "✅ Created ai-service/.env from example"
else
    echo "ℹ️  ai-service/.env already exists"
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p models
mkdir -p ai-service/vector_db
mkdir -p api/uploads
mkdir -p api/knowledge

# Set permissions for scripts
echo "🔐 Setting script permissions..."
chmod +x scripts/*.sh

# Install API dependencies (if Node.js is available locally)
if command -v npm &> /dev/null; then
    echo "📦 Installing API dependencies..."
    cd api && npm install && cd ..
    echo "✅ API dependencies installed"
else
    echo "ℹ️  Node.js not found locally. Dependencies will be installed in Docker container."
fi

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "🚀 To start the system:"
echo "   ./scripts/start-dev.sh"
echo ""
echo "📚 To view the project structure:"
echo "   tree -I 'node_modules|dist|*.log'"