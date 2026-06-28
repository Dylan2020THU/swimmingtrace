import { ApiProperty } from '@nestjs/swagger';

/** OpenAPI documentation type: mirrors @swim/shared's ApiErrorResponse (returned by the global exception filter). */
export class ApiErrorResponseDto {
  @ApiProperty() statusCode: number;
  @ApiProperty() error: string;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message: string | string[];
  @ApiProperty() requestId: string;
  @ApiProperty() timestamp: string;
  @ApiProperty() path: string;
}
