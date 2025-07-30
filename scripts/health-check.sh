#!/bin/bash

# Health Check Script for Voice AI Decision System
set -e

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

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo "🏥 Voice AI System Health Check"
echo "================================"

# Check Docker containers
print_status "Checking Docker containers..."
containers=("voice-ai-api" "voice-ai-python" "voice-ai-nginx")
all_healthy=true

for container in "${containers[@]}"; do
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$container"; then
        status=$(docker ps --format "{{.Status}}" --filter "name=$container")
        if [[ $status == *"healthy"* ]] || [[ $status == *"Up"* ]]; then
            print_success "$container: $status"
        else
            print_warning "$container: $status"
            all_healthy=false
        fi
    else
        print_error "$container: Not running"
        all_healthy=false
    fi
done

# Check service endpoints
print_status "Checking service endpoints..."

# Check API service
if curl -f -s http://localhost:3000/health > /dev/null; then
    print_success "API Service (port 3000): Healthy"
else
    print_error "API Service (port 3000): Unhealthy"
    all_healthy=false
fi

# Check AI service
if curl -f -s http://localhost:8000/health > /dev/null; then
    print_success "AI Service (port 8000): Healthy"
else
    print_error "AI Service (port 8000): Unhealthy"
    all_healthy=false
fi

# Check Nginx
if curl -f -s http://localhost:80/health > /dev/null; then
    print_success "Nginx (port 80): Healthy"
else
    print_warning "Nginx (port 80): May not be configured or running"
fi

# Check resource usage
print_status "Checking resource usage..."
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" | head -4

# Check disk usage
print_status "Checking disk usage..."
docker system df

# Check logs for errors
print_status "Checking recent logs for errors..."
for container in "${containers[@]}"; do
    if docker ps --filter "name=$container" --format "{{.Names}}" | grep -q "$container"; then
        error_count=$(docker logs --since=5m "$container" 2>&1 | grep -i error | wc -l)
        if [ "$error_count" -gt 0 ]; then
            print_warning "$container: $error_count errors in last 5 minutes"
            all_healthy=false
        else
            print_success "$container: No recent errors"
        fi
    fi
done

echo "================================"
if [ "$all_healthy" = true ]; then
    print_success "🎉 All systems healthy!"
    exit 0
else
    print_error "⚠️  Some issues detected. Check the output above."
    exit 1
fi