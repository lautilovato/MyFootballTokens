import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  // @nestjs/*, @mikro-orm/*, axios, keyv and cache-manager ship ESM-only (some, like
  // @nestjs/common, use `import.meta.url`, which has no CommonJS equivalent) — Jest has to
  // run as real ESM to load them, unlike plain `node`, which transparently supports
  // require(esm) since Node 22.
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    // `module`/`moduleResolution` overrides: the base tsconfig's `nodenext` ties output
    // format to each file's own package.json `type`, which would still emit CommonJS for
    // our extensionless-import source files even under useESM. Forcing `esnext` + `bundler`
    // makes ts-jest emit real ESM for everything (ours and the already-ESM deps alike)
    // while still resolving our extensionless relative imports (nodenext ESM would require
    // explicit `.js` extensions on every relative import, which this codebase doesn't use).
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { useESM: true, tsconfig: { module: 'esnext', moduleResolution: 'bundler' } },
    ],
  },
  // Let ts-jest transform the ESM-only packages above instead of skipping node_modules.
  transformIgnorePatterns: [],
  moduleNameMapper: {
    ...pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
