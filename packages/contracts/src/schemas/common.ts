import { z } from 'zod';

/**
 * Common schema primitives
 */
export const IdSchema = z.string().uuid().describe('Unique identifier');

export const TimestampSchema = z
  .string()
  .datetime()
  .or(z.date())
  .describe('ISO 8601 timestamp');

export const MoneySchema = z
  .object({
    amountInCents: z.number().int().nonnegative(),
    currency: z.string().length(3).toUpperCase(),
  })
  .describe('Money value with currency');

export const QuantitySchema = z
  .object({
    value: z.number().nonnegative(),
    unit: z.string(),
  })
  .describe('Quantity with unit');

/**
 * Pagination schemas
 */
export const PaginationRequestSchema = z
  .object({
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().positive().max(100).default(20),
  })
  .describe('Pagination parameters');

export const PaginationMetaSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalCount: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .describe('Pagination metadata');

/**
 * Type exports from schemas
 */
export type Id = z.infer<typeof IdSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type Quantity = z.infer<typeof QuantitySchema>;
export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
