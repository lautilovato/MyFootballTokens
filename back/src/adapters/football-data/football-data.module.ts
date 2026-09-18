import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { FootballDataAdapter } from './football-data.adapter';
import { FootballDataClient } from './football-data.client';

@Module({
  imports: [HttpModule],
  providers: [FootballDataClient, FootballDataAdapter],
  exports: [FootballDataAdapter],
})
export class FootballDataModule {}
