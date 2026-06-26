import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth.common';
import { PlacesService } from './places.service';

@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(private places: PlacesService) {}

  // GET /places/nearby?lat=1.30&lng=103.85&radiusMeters=5000
  @Get('nearby')
  nearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusMeters') radiusMeters?: string,
  ) {
    return this.places.nearby(
      parseFloat(lat),
      parseFloat(lng),
      radiusMeters ? parseFloat(radiusMeters) : 5000,
    );
  }
}
