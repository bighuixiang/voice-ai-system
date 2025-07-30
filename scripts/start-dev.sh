#!/bin/bash

# Voice AI Decision System - Development Startup Script

echo "🚀 Starting Voice AI Decision System in Development Mode..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p models
mkdir -p ai-service/vector_db
mkdir -p api/uploads
mkdir -p api/knowledge

# Build and start services
echo "🔨 Building and starting services..."
docker-compose up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check API service
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ API Service is healthy"
else
    echo "❌ API Service is not responding"
fi

# Check AI service
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ AI Service is healthy"
else
    echo "❌ AI Service is not responding"
fi

# Check Nginx
if curl -f http://localhost/nginx-health > /dev/null 2>&1; then
    echo "✅ Nginx is healthy"
else
    echo "❌ Nginx is not responding"
fi

echo ""
echo "🎉 Voice AI Decision System is running!"
echo ""
echo "📋 Service URLs:"
echo "   • Main Application: http://localhost"
echo "   • API Service: http://localhost:3000"
echo "   • AI Service: http://localhost:8000"
echo "   • API Health: http://localhost:3000/health"
echo "   • AI Health: http://localhost:8000/health"
echo ""
echo "📝 To view logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose down"