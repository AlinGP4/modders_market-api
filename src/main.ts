// src/main.ts (COMPLETO con .env)
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = new Set([
    'http://localhost:4200',
    'http://localhost:3000',
    'https://modders-market.com',
    'https://www.modders-market.com',
    'https://api.modders-market.com',
  ]);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        allowedOrigins.has(origin) ||
        /^https:\/\/([a-z0-9-]+\.)?modders-market\.com$/i.test(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    optionsSuccessStatus: 204,
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

  const port = Number(configService.get<string>('PORT') ?? 3006);
  await app.listen(port);
  const publicApiUrl = (configService.get<string>('API_PUBLIC_URL') ?? `http://localhost:${port}`).replace(
    /\/+$/,
    '',
  );
  console.log(`🚀 API running on ${publicApiUrl}/api`);
}
bootstrap();
