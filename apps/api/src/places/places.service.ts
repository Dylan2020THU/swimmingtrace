import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NearbyPlace } from '@swim/shared';

@Injectable()
export class PlacesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Nearby pools within `radiusMeters`, ordered by distance.
   * Uses PostGIS geography so distances are true meters on the sphere.
   *
   * Scale note: add a GiST index for speed —
   *   CREATE INDEX pool_geog_idx ON "Pool"
   *   USING GIST (geography(ST_MakePoint("longitude","latitude")));
   */
  async nearby(lat: number, lng: number, radiusMeters: number): Promise<NearbyPlace[]> {
    return this.prisma.$queryRaw<NearbyPlace[]>`
      SELECT
        id,
        name,
        address,
        latitude,
        longitude,
        ST_Distance(
          ST_MakePoint(longitude, latitude)::geography,
          ST_MakePoint(${lng}, ${lat})::geography
        ) AS "distanceMeters"
      FROM "Pool"
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND ST_DWithin(
          ST_MakePoint(longitude, latitude)::geography,
          ST_MakePoint(${lng}, ${lat})::geography,
          ${radiusMeters}
        )
      ORDER BY "distanceMeters" ASC
      LIMIT 50
    `;
  }
}
