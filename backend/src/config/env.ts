import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface EnvConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string[];
  apiPrefix: string;
}

function getEnvVariable(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parsePort(portString: string): number {
  const port = parseInt(portString, 10);
  if (isNaN(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port number: ${portString}`);
  }
  return port;
}

function parseCorsOrigins(originsString: string): string[] {
  return originsString.split(',').map(origin => origin.trim());
}

export const config: EnvConfig = {
  port: parsePort(getEnvVariable('PORT', '3001')),
  nodeEnv: getEnvVariable('NODE_ENV', 'development'),
  corsOrigin: parseCorsOrigins(
    getEnvVariable('CORS_ORIGIN', 'https://localhost:3000')
  ),
  apiPrefix: getEnvVariable('API_PREFIX', '/api'),
};

export default config;
