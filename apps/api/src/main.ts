import 'reflect-metadata';
import './load-env';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env, isProduction, loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  loadEnv();
  const app = await NestFactory.create(AppModule, { rawBody: false });
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: isProduction() ? { maxAge: 15552000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());
  app.use(json({ limit: '32kb' }));
  app.use(urlencoded({ extended: false, limit: '32kb' }));

  const corsOrigin = env().CORS_ORIGIN;
  if (!isProduction() && corsOrigin) {
    app.enableCors({ origin: corsOrigin, credentials: true });
  }

  app.enableShutdownHooks();

  const port = env().API_PORT;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
