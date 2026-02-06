import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

// Load environment variables first - explicitly from the backend root
const envPath = resolve(__dirname, '..', '.env');

// Check if file exists
if (!fs.existsSync(envPath)) {
  console.error(`[Server] ERROR: .env file not found at ${envPath}`);
  process.exit(1);
}

// Read and parse .env file manually to ensure proper loading
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');

for (const line of envLines) {
  const trimmed = line.trim();
  // Skip comments and empty lines
  if (!trimmed || trimmed.startsWith('#')) continue;

  const eqIndex = trimmed.indexOf('=');
  if (eqIndex > 0) {
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Set in process.env
    process.env[key] = value;
  }
}

// Also run dotenv for compatibility
const result = config({ path: envPath, override: true });

// Dynamic imports to ensure env is loaded first
async function startServer() {
  // Initialize DI container first (dynamic import ensures env is loaded)
  await import('./container');

  // Then import app which resolves controllers
  const { app } = await import('./app');

  const PORT = process.env.PORT || 3001;

  const server = app.listen(PORT, () => {
    console.log(`🚀 EstateIQ Server running on port ${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    server.close(() => {
      process.exit(0);
    });
  });

  return server;
}

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
