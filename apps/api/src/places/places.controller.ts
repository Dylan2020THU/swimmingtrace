import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth.common';
import { PlacesService } from './places.service';

@ApiTags('places')
@ApiBearerAuth()
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
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      throw new BadRequestException('lat and lng are required and must be numbers');
    }
    const radius = radiusMeters !== undefined ? parseFloat(radiusMeters) : 5000;
    return this.places.nearby(latNum, lngNum, Number.isNaN(radius) ? 5000 : radius);
  }
}
