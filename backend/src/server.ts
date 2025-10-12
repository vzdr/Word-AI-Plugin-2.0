import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import config from './config/env';

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
    app.listen(config.port, () => {
      console.log('='.repeat(50));
      console.log(`Server running in ${config.nodeEnv} mode`);
      console.log(`Listening on port ${config.port}`);
      console.log(`URL: http://localhost:${config.port}`);
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
