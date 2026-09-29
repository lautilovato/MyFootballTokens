import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Sonda de vida sin autenticación: solo confirma que el proceso responde. No toca base de
   * datos ni caché, así que un 200 acá no dice nada sobre sus dependencias.
   */
  @Get()
  @ApiOperation({ summary: 'Sonda de vida de la API' })
  @ApiResponse({ status: 200, description: 'La API está en pie', type: String })
  getHello(): string {
    return this.appService.getHello();
  }
}
