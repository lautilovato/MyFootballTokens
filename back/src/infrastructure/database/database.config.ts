import { defineConfig } from '@mikro-orm/postgresql';
import { join } from 'path';
import { Migrator } from '@mikro-orm/migrations';
import * as dotenv from 'dotenv';

// Cargar variables de entorno según el entorno
const isTest = process.env.NODE_ENV === 'test';
const envFile = isTest ? '.env.test' : '.env';

// __dirname doesn't exist under ESM (Jest runs this file as ESM — see jest.config.ts — while
// `nest build`/CLI run it as CommonJS, where __dirname is real). `typeof` avoids the
// ReferenceError that a bare reference would throw when the binding doesn't exist. When it's
// missing, cwd is used directly instead (already `back/`, no `../../../` needed) since every
// documented entrypoint (nest build/start, npm test, mikro-orm CLI) runs from there.
const currentDir = typeof __dirname !== 'undefined' ? __dirname : null;
const projectRoot = currentDir ? join(currentDir, '../../../') : process.cwd();

dotenv.config({ path: join(projectRoot, envFile) });

export default defineConfig({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  dbName: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,

  entities: ['dist/**/*.entity.js'],
  entitiesTs: ['src/**/*.entity.ts'],

  extensions: [Migrator],
  migrations: {
    path: join(currentDir ?? projectRoot, './migrations'),
    pathTs: join(currentDir ?? projectRoot, './migrations'),
    snapshot: true,
    transactional: true,
    disableForeignKeys: false,
    allOrNothing: true,
    dropTables: true,
    safe: false,
    snapshotName: '.snapshot',
  },
  
  debug: process.env.NODE_ENV === 'dev',
  timezone: 'UTC',
  allowGlobalContext: true,
});