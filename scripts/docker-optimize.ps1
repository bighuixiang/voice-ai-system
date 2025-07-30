# Docker Optimization Script for Voice AI Decision System (PowerShell)
param(
    [switch]$Production = $false
)

Write-Host "🚀 Starting Docker optimization..." -ForegroundColor Green

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Status "Docker is running"
} catch {
    Write-Error "Docker is not running. Please start Docker first."
    exit 1
}

# Clean up old containers and images
Write-Status "Cleaning up old Docker resources..."
docker system prune -f
docker volume prune -f

# Remove dangling images
Write-Status "Removing dangling images..."
docker image prune -f

# Build optimized images
Write-Status "Building optimized Docker images..."

# Build API service with build cache
Write-Status "Building API service..."
docker build --build-arg BUILDKIT_INLINE_CACHE=1 --cache-from voice-ai-api:latest -t voice-ai-api:latest -f api/Dockerfile ./api

# Build AI service with build cache
Write-Status "Building AI service..."
docker build --build-arg BUILDKIT_INLINE_CACHE=1 --cache-from voice-ai-python:latest -t voice-ai-python:latest -f ai-service/Dockerfile ./ai-service

# Create necessary directories
Write-Status "Creating necessary directories..."
$directories = @("models", "api/uploads", "api/knowledge", "ai-service/vector_db")
foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Status "Created directory: $dir"
    }
}

# Display image sizes
Write-Status "Docker image sizes:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | Select-String -Pattern "(voice-ai|REPOSITORY)"

# Display system info
Write-Status "Docker system information:"
docker system df

Write-Status "✅ Docker optimization completed!"

if ($Production) {
    Write-Status "Starting services in production mode..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
} else {
    Write-Status "To start the optimized services, run:"
    Write-Status "  docker-compose up -d"
    Write-Status "For production deployment, run:"
    Write-Status "  docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
}