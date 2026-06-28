import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Route Nest's own logs through pino (structured + request-correlated).
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.use(compression());

  // Strip unknown props, transform payloads to DTO types.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Graceful shutdown: SIGTERM/SIGINT → onModuleDestroy → Prisma $disconnect.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  // Lock CORS to a configured allowlist (comma-separated CORS_ORIGIN).
  const origins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  if (config.get<string>('SWAGGER_ENABLED') !== 'false') {
    setupSwagger(app);
  }

  await app.listen(config.get<string>('PORT') ?? '3000');
}
bootstrap();
