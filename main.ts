import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Strip unknown props, transform payloads to DTO types.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // TODO: lock CORS down to your client origins before launch.
  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
