/**
 * Common DTOs for pagination
 */
export interface PaginationRequest {
  page: number;
  pageSize: number;
}

export interface PaginationResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Common DTO for timestamps
 */
export interface TimestampedDto {
  createdAt: Date;
  updatedAt: Date;
}
