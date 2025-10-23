#!/bin/bash

echo "🦞 Setting up Lobster Protocol Analytical Formulas..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building project..."
npm run build

# Run tests
echo "🧪 Running tests..."
npm test

# Run demo
echo "🚀 Running demo..."
npm run dev

echo "✅ Setup complete!"