import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface EnvConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string[];
  apiPrefix: string;
  aiProvider: 'openai' | 'gemini';
  openai: {
    apiKey: string;
    orgId?: string;
  };
  gemini: {
    apiKey: string;
  };
  ai: {
    defaultModel: string;
    defaultTemperature: number;
    defaultMaxTokens: number;
    requestTimeout: number;
    maxRetries: number;
  };
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
  aiProvider: (getEnvVariable('AI_PROVIDER', 'gemini') as 'openai' | 'gemini'),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    orgId: process.env.OPENAI_ORG_ID,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  ai: {
    defaultModel: getEnvVariable('DEFAULT_AI_MODEL', 'gemini-2.5-pro'),
    defaultTemperature: parseFloat(getEnvVariable('DEFAULT_AI_TEMPERATURE', '0.7')),
    defaultMaxTokens: parseInt(getEnvVariable('DEFAULT_AI_MAX_TOKENS', '2000'), 10),
    requestTimeout: parseInt(getEnvVariable('AI_REQUEST_TIMEOUT', '30000'), 10),
    maxRetries: parseInt(getEnvVariable('AI_MAX_RETRIES', '3'), 10),
  },
};

export default config;
