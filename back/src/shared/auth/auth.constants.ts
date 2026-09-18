/**
 * Constantes transversales de autenticación y autorización.
 * Viven en /shared/ porque las consumen varios módulos de dominio
 * (auth, player, player-stats, ingestion, team-whoscored-matching).
 */

/** Header que transporta la clave administrativa (contracts/auth.openapi.yaml). */
export const ADMIN_API_KEY_HEADER = 'x-api-key';

/** Nombres de los esquemas de seguridad declarados en Swagger. */
export const SWAGGER_BEARER_SCHEME = 'bearerAuth';
export const SWAGGER_API_KEY_SCHEME = 'adminApiKey';

/** Claves de configuración por entorno (FR-014, research #7 y #9). */
export const AUTH_ENV = {
  jwtSecret: 'JWT_SECRET',
  jwtExpiration: 'JWT_EXPIRATION',
  adminApiKey: 'ADMIN_API_KEY',
  rateLimitTtl: 'AUTH_RATE_LIMIT_TTL',
  rateLimitMax: 'AUTH_RATE_LIMIT_MAX',
  corsAllowedOrigins: 'CORS_ALLOWED_ORIGINS',
} as const;

/**
 * Sin estas dos la aplicación no debe levantar: un despliegue sin ADMIN_API_KEY
 * dejaría los endpoints administrativos comparando contra undefined.
 */
export const REQUIRED_AUTH_ENV: readonly string[] = [
  AUTH_ENV.jwtSecret,
  AUTH_ENV.adminApiKey,
];

/** Único mensaje admitido ante un login fallido (FR-008, SC-006). */
export const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';

/** Valores por defecto del límite de intentos (research #7). */
export const DEFAULT_RATE_LIMIT_TTL_SECONDS = 60;
export const DEFAULT_RATE_LIMIT_MAX = 5;
