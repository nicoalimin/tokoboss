import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LedgerClient } from '@/app/ledger/[variantId]/ledger-client';
import type { VariantLedgerEntry, Warehouse } from '@/lib/catalog-types';
import { CatalogClientError } from '@/lib/catalog-client';

// Mock the required modules
vi.mock('@/lib/use-membership', () => ({
  useMembership: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/lib/catalog-client', () => ({
  getLedger: vi.fn(),
  adjustStock: vi.fn(),
  getStockBalance: vi.fn(),
  getStockSettings: vi.fn(),
  listWarehouses: vi.fn(),
}));

describe('Stock Ledger UI Component - Behavior Tests', () => {
  const mockUseMembership = vi.mocked(
    (await import('@/lib/use-membership')).useMembership
  );
  const mockUseRouter = vi.mocked((await import('next/navigation')).useRouter);
  const mockListWarehouses = vi.mocked(
    (await import('@/lib/catalog-client')).listWarehouses
  );
  const mockGetLedger = vi.mocked(
    (await import('@/lib/catalog-client')).getLedger
  );
  const mockGetStockBalance = vi.mocked(
    (await import('@/lib/catalog-client')).getStockBalance
  );
  const mockGetStockSettings = vi.mocked(
    (await import('@/lib/catalog-client')).getStockSettings
  );
  const mockAdjustStock = vi.mocked(
    (await import('@/lib/catalog-client')).adjustStock
  );

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockUseMembership.mockReturnValue({
      workspaceId: 'workspace-1',
      role: 'staff',
      userId: 'user-1',
    });

    mockUseRouter.mockReturnValue({
      push: vi.fn(),
    });

    mockListWarehouses.mockResolvedValue([
      { id: 'wh-1', name: 'Warehouse 1', isActive: true },
      { id: 'wh-2', name: 'Warehouse 2', isActive: false },
    ]);

    mockGetStockBalance.mockResolvedValue({
      variantId: 'variant-1',
      workspaceId: 'workspace-1',
      totalQty: 5,
      perWarehouse: [
        { warehouseId: 'wh-1', qty: 3, version: 1 },
        { warehouseId: 'wh-2', qty: 2, version: 2 },
      ],
    });

    mockGetLedger.mockResolvedValue([
      {
        id: 'entry-1',
        variantId: 'variant-1',
        warehouseId: 'wh-1',
        delta: 5,
        reason: 'Initial stock',
        timestamp: new Date('2023-01-01T00:00:00Z'),
        createdBy: 'user-1',
      } as VariantLedgerEntry,
    ]);

    mockGetStockSettings.mockResolvedValue({
      allowNegative: false,
    });
  });

  it('initializes with correct API calls and data flow for Staff role', async () => {
    // Render the component
    render(<LedgerClient variantId="variant-1" />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText(/Total stock/)).toBeInTheDocument();
      expect(screen.getByText(/Warehouse 1/)).toBeInTheDocument();
    });

    // Verify all necessary API calls were made
    expect(mockListWarehouses).toHaveBeenCalledWith('workspace-1');
    expect(mockGetStockBalance).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      variantId: 'variant-1',
    });
    expect(mockGetLedger).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      variantId: 'variant-1',
    });
    expect(mockGetStockSettings).toHaveBeenCalledWith('workspace-1');
  });

  it('sets correct permission levels based on user role', async () => {
    // Test with staff user
    mockUseMembership.mockReturnValue({
      workspaceId: 'workspace-1',
      role: 'staff',
      userId: 'user-1',
    });

    render(<LedgerClient variantId="variant-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Total stock/)).toBeInTheDocument();
    });

    // Staff should be read-only
    expect(
      screen.queryByRole('button', { name: /Adjust/ })
    ).not.toBeInTheDocument();

    // Test with manager user (should have adjust button)
    mockUseMembership.mockReturnValue({
      workspaceId: 'workspace-1',
      role: 'manager',
      userId: 'user-1',
    });

    render(<LedgerClient variantId="variant-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Total stock/)).toBeInTheDocument();
    });

    // Manager should see adjust button
    expect(screen.getByRole('button', { name: /Adjust/ })).toBeInTheDocument();
  });

  it('submits adjustments with expectedVersion parameter', async () => {
    // Setup manager role to be able to submit adjustments
    mockUseMembership.mockReturnValue({
      workspaceId: 'workspace-1',
      role: 'manager',
      userId: 'user-1',
    });

    const mockAdjustStockResult = { id: 'adjustment-1', version: 2 };
    mockAdjustStock.mockResolvedValue(mockAdjustStockResult);

    render(<LedgerClient variantId="variant-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Total stock/)).toBeInTheDocument();
    });

    // Mock the form submission
    const adjustmentForm = screen.getByTestId('adjustment-form');
    const warehouseSelect = screen.getByLabelText(/Warehouse/);
    const deltaInput = screen.getByLabelText(/Delta/);
    const reasonInput = screen.getByLabelText(/Reason/);

    // Fill form
    vi.spyOn(warehouseSelect, 'value', 'get').mockReturnValue('wh-1');
    vi.spyOn(deltaInput, 'value', 'get').mockReturnValue('2');
    vi.spyOn(reasonInput, 'value', 'get').mockReturnValue('Stock adjustment');

    // Try to submit
    const submitButton = screen.getByRole('button', {
      name: /Submit Adjustment/,
    });

    await waitFor(() => {
      expect(submitButton).toBeInTheDocument();
      submitButton.click();
    });

    // Verify expectedVersion was passed in the request
    expect(mockAdjustStock).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      variantId: 'variant-1',
      warehouseId: 'wh-1',
      delta: 2,
      reason: 'Stock adjustment',
      idempotencyKey: expect.any(String), // Should generate a key
      expectedVersion: 1, // From the pre-fetched stock balance
    });
  });

  it('handles insufficient quantity errors appropriately', async () => {
    // Setup manager role to be able to submit adjustments
    mockUseMembership.mockReturnValue({
      workspaceId: 'workspace-1',
      role: 'manager',
      userId: 'user-1',
    });

    // Simulate an insufficient stock error
    const insufficientStockError = new CatalogClientError(
      'CATALOG_INSUFFICIENT_STOCK',
      'Insufficient stock in warehouse'
    );
    mockAdjustStock.mockRejectedValue(insufficientStockError);

    render(<LedgerClient variantId="variant-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Total stock/)).toBeInTheDocument();
    });

    // Try to submit with insufficient stock
    const submitButton = screen.getByRole('button', {
      name: /Submit Adjustment/,
    });

    await waitFor(() => {
      expect(submitButton).toBeInTheDocument();
      submitButton.click();
    });

    // Should display appropriate error message without collapsing the UI
    expect(
      screen.getByText(/Insufficient stock in warehouse/)
    ).toBeInTheDocument();
  });

  it('respects warehouse filtering capabilities', async () => {
    render(<LedgerClient variantId="variant-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Total stock/)).toBeInTheDocument();
    });

    // Check that different warehouse filters work
    const allWarehousesOption = screen.getByRole('option', {
      name: 'All Warehouses',
    });
    const warehouse1Option = screen.getByRole('option', {
      name: 'Warehouse 1',
    });

    expect(allWarehousesOption).toBeInTheDocument();
    expect(warehouse1Option).toBeInTheDocument();
  });

  it('displays consolidated stock and per-warehouse quantities', async () => {
    render(<LedgerClient variantId="variant-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Total stock/)).toBeInTheDocument();
    });

    // Check that the consolidated total is displayed
    expect(screen.getByText(/5/)).toBeInTheDocument();

    // Check that per warehouse quantities are displayed
    expect(screen.getByText(/Warehouse 1/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/Warehouse 2/)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });
});
