import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module';
import { PinoLoggerService } from './shared/logging/pino-logger.service';
import {
  ADMIN_API_KEY_HEADER,
  AUTH_ENV,
  REQUIRED_AUTH_ENV,
  SWAGGER_API_KEY_SCHEME,
  SWAGGER_BEARER_SCHEME,
} from './shared/auth/auth.constants';

/**
 * Falla el arranque si falta configuración crítica de seguridad.
 * Preferimos no levantar antes que levantar con los endpoints administrativos
 * comparando contra undefined (data-model.md, quickstart E1).
 */
function assertRequiredAuthConfig(): void {
  const faltantes = REQUIRED_AUTH_ENV.filter((k) => !process.env[k]?.trim());
  if (faltantes.length > 0) {
    throw new Error(
      `Configuración incompleta: falta(n) ${faltantes.join(', ')}. ` +
        'La aplicación no arranca sin estas variables por motivos de seguridad.',
    );
  }
}

function parseAllowedOrigins(): string[] | boolean {
  const raw = process.env[AUTH_ENV.corsAllowedOrigins]?.trim();
  if (!raw) return false;
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

async function bootstrap() {
  assertRequiredAuthConfig();

  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLoggerService));

  // La credencial viaja en el header Authorization, no en cookies (FR-019),
  // por eso credentials queda en false (research #9).
  app.enableCors({ origin: parseAllowedOrigins(), credentials: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mercado de Jugadores de Fútbol')
    .setDescription('API del catálogo de jugadores')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      SWAGGER_BEARER_SCHEME,
    )
    .addApiKey(
      { type: 'apiKey', name: ADMIN_API_KEY_HEADER, in: 'header' },
      SWAGGER_API_KEY_SCHEME,
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
