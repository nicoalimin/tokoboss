# Stock Ledger Runbook

## Overview

This document provides guidance for understanding and operating the stock ledger functionality. The ledger shows stock movements and adjustments for a product variant, including warehouse-specific stock balances and historical records.

## Key Functionality

### 1. Stock Balances

- Shows total stock across all warehouses
- Displays per-warehouse stock quantities
- Highlights if negative stock adjustments are allowed

### 2. Adjustment Features

- Record new stock adjustments
- Requires warehouse selection, adjustment amount, and reason
- Only available to users with Manager/Admin permissions

### 3. Error Handling

#### Adjustment Errors (specific mapped error messages)

- **Insufficient Stock**: When attempting to reduce stock below zero
- **Inactive Warehouse**: When selecting an inactive warehouse
- **Version Conflict**: When another user has modified the variant since it was loaded
- **Generic Validation**: For other validation errors

## Common Issues & Troubleshooting

### No Stock Data

- Check that the product variant exists
- Ensure warehouse data is properly configured in the workspace

### Adjustment Fails Unexpectedly

1. Verify the warehouse is active
2. Confirm sufficient stock exists for negative adjustments
3. Ensure no concurrent modifications (retry if version conflict)

## RBAC Notes

- **Staff users**: Read-only access to ledger and stock data
- **Manager/Admin users**: Full read/write access including creating new adjustments
