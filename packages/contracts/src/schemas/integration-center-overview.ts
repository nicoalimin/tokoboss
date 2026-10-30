import { z } from 'zod';
import { IntegrationConnectionViewSchema } from './integrations';
import { IntegrationActivityItemDtoSchema } from './integration-management';
import {
  ConnectionHealthBadgeDtoSchema,
  ConnectionOperationalMetricsDtoSchema,
  ConnectionSetupChecklistDtoSchema,
} from './integration-health-views';

/**
 * Story 18 Integration Center overview (UTA-38 / US18, RFC 07 addendum row
 * 44d): KPI bar + store health table + activity feed for
 * GET /api/workspaces/[workspaceId]/integrations/overview (all members).
 * Strict, read-only, no tokens or buyer PII. Dates are ISO strings.
 */

const Count = z.number().int().nonnegative();

/** The four Integration Center KPIs (mirrors toIntegrationKpiSummary). */
export const IntegrationKpiSummaryDtoSchema = z
  .object({
    totalStores: Count,
    healthyActiveCount: Count,
    pausedCount: Count,
    needsReauthCount: Count,
  })
  .strict();
export type IntegrationKpiSummaryDto = z.infer<
  typeof IntegrationKpiSummaryDtoSchema
>;

/** One store health table row (mirrors StoreHealthRowView). */
export const StoreHealthRowDtoSchema = z
  .object({
    connection: IntegrationConnectionViewSchema,
    health: ConnectionHealthBadgeDtoSchema,
    metrics: ConnectionOperationalMetricsDtoSchema,
    checklist: ConnectionSetupChecklistDtoSchema,
  })
  .strict();
export type StoreHealthRowDto = z.infer<typeof StoreHealthRowDtoSchema>;

export const IntegrationCenterOverviewResponseSchema = z
  .object({
    kpis: IntegrationKpiSummaryDtoSchema,
    stores: z.array(StoreHealthRowDtoSchema),
    activity: z.array(IntegrationActivityItemDtoSchema),
  })
  .strict();
export type IntegrationCenterOverviewResponse = z.infer<
  typeof IntegrationCenterOverviewResponseSchema
>;
