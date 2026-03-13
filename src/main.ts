// src/main.ts (COMPLETO con .env)
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: ['http://localhost:4200', 'http://localhost:3000','https://www.modders-market.com','https://modders-market.com'],
    credentials: true
  });

  // ConfigService para .env
  const configService = app.get(ConfigService);
  
   app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }));
  const config = new DocumentBuilder()
    .setTitle('ModdersMarket API')
    .setDescription('Freelance Modders MVP')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(configService.get('PORT') || 3000);
  console.log(`🚀 API running on http://localhost:${configService.get('PORT') || 3000}/api`);
}
bootstrap();
