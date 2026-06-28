import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorResponseDto } from './common/api-error.dto';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('SwimmingTrace API')
    .setDescription('泳池主控制台 + 游泳者端 API。错误统一返回 ApiErrorResponse 信封。')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, { extraModels: [ApiErrorResponseDto] });
  SwaggerModule.setup('docs', app, document);
}
