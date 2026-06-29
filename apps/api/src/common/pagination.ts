import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

/** Normalize offset-pagination params: page≥1 (default 1), pageSize 1–100 (default 20). */
export function paginate(
  page?: number,
  pageSize?: number,
): { skip: number; take: number; page: number; pageSize: number } {
  const p = page && page > 0 ? page : 1;
  const ps = pageSize && pageSize > 0 ? Math.min(pageSize, 100) : 20;
  return { skip: (p - 1) * ps, take: ps, page: p, pageSize: ps };
}
