import { Module } from '@nestjs/common';
import { FootballDataModule } from '../../adapters/football-data/football-data.module';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { IngestionController } from './ingestion.controller';
import { IngestionRepository } from './ingestion.repository';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [FootballDataModule, AuthSharedModule],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionRepository],
})
export class IngestionModule {}
