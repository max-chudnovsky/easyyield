#!/bin/bash

# Velesco Production Deploy Script
# Builds and deploys the application to Cloudflare Workers

set -e  # Exit on any error

echo "🚀 Starting Velesco production deployment..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "wrangler.toml" ]; then
    print_error "This script must be run from the Velesco project root directory"
    exit 1
fi

# Check if required dependencies are installed
print_status "Checking dependencies..."
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    exit 1
fi

if ! command -v npx &> /dev/null; then
    print_error "npx is not installed"
    exit 1
fi

# Install/update dependencies
print_status "Installing dependencies..."
sudo npm install 2>/dev/null && print_success "Dependencies installed successfully"

# Build CSS
print_status "Building Tailwind CSS..."
npm run build:css

# Build the application
print_status "Building application..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    print_error "Build failed - dist directory not found"
    exit 1
fi

print_success "Build completed successfully"

# Deploy to Cloudflare Workers
print_status "Deploying to Cloudflare Workers..."
npx wrangler deploy

if [ $? -eq 0 ]; then
    print_success "🎉 Deployment successful!"
    echo ""
    echo "Your Velesco platform is now live at:"
    echo "https://velesco.max-17f.workers.dev"
    echo ""
    echo "To test the deployment:"
    echo "1. Visit the URL above"
    echo "2. Try the authentication system"
    echo "3. Check browser console for any errors"
else
    print_error "Deployment failed"
    exit 1
fi

echo ""
print_status "Deployment complete! ✨"
