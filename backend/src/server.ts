import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import config from './config/env';
import apiRoutes from './routes';

const app: Application = express();

// Middleware setup
// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration - Allow requests from Office.js plugin origin
const corsOptions = {
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Logging middleware
const logFormat = config.nodeEnv === 'production' ? 'combined' : 'dev';
app.use(morgan(logFormat));

// Basic route for testing
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Word AI Plugin API Server',
    version: '1.0.0',
    environment: config.nodeEnv,
  });
});

// Mount API routes
app.use(config.apiPrefix, apiRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  res.status(500).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'development' ? err.message : 'Something went wrong',
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
});

// Start server
const startServer = () => {
  try {
    // Use Office Add-in dev certificates
    const certPath = path.join(os.homedir(), '.office-addin-dev-certs');
    const keyPath = path.join(certPath, 'localhost.key');
    const crtPath = path.join(certPath, 'localhost.crt');

    if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
      console.error('Office Add-in dev certificates not found. Please run "npx office-addin-dev-certs install" to create them.');
      process.exit(1);
    }

    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(crtPath),
    };

    https.createServer(httpsOptions, app).listen(config.port, () => {
      console.log('='.repeat(50));
      console.log(`Server running in ${config.nodeEnv} mode`);
      console.log(`Listening on port ${config.port}`);
      console.log(`URL: https://localhost:${config.port}`);
      console.log(`CORS enabled for: ${config.corsOrigin.join(', ')}`);
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
