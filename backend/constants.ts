/**
 * Order tracking status and substatus values.
 * Single source of truth to avoid typos and silent state-machine bugs.
 */

export const OrderStatus = {
  QUEUED: "queued",
  PENDING: "pending",
  CREATE_SUCCESS: "create_success",
  AWAITING_WEBHOOK: "awaiting_webhook",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type OrderStatusValue = (typeof OrderStatus)[keyof typeof OrderStatus];

export const Substatus = {
  /** API response */
  IMMEDIATE_201: "201-immediate",
  DEFERRED_202: "202-deferred",
  FRAUD_502: "502-fraud",
  RETRY_503: "503-retry",
  ERROR_500: "500-error",
  /** Internal / webhook */
  WEBHOOK_REGISTERED: "webhook_registered",
  CREATE_FAILURE: "create_failure",
  CREATE_SUCCESS: "create_success",
  CONFIRM_SUCCESS: "confirm_success",
  CONFIRM_FAILURE: "confirm_failure",
} as const;

export type SubstatusValue = (typeof Substatus)[keyof typeof Substatus];
