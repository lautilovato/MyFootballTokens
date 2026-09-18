// @nestjs/throttler es CommonJS y hace require('@nestjs/common'), que es ESM puro.
// En Jest con --experimental-vm-modules, ese require falla si @nestjs/common
// todavía está cargándose por un import() concurrente. Precargarlo acá garantiza
// que ya esté evaluado cuando throttler lo requiera.
await import('@nestjs/common');
await import('@nestjs/core');
