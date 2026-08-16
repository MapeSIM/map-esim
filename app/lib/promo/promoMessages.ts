export const PROMO_AUDIT = {
  created: "promo.created",
  updated: "promo.updated",
  enabled: "promo.enabled",
  disabled: "promo.disabled",
  appliedToPurchase: "promo.applied_to_purchase",
  redemptionCompleted: "promo.redemption_completed",
} as const;

export const PROMO_CUSTOMER_MESSAGES = {
  INVALID: "Invalid promo code",
  INACTIVE: "Promo code is inactive",
  EXPIRED: "Promo code has expired",
  NOT_STARTED: "Promo code is not active yet",
  MIN_ORDER: "Minimum order amount not met",
  USAGE_LIMIT: "Promo usage limit reached",
  CUSTOMER_LIMIT: "You have already used this promo the maximum number of times",
  NOT_APPLICABLE: "Promo is not valid for this destination/plan",
  FIRST_ORDER_ONLY: "Promo is for first orders only",
  PARTNER_REJECTED: "Promo codes are not available for Partner purchases.",
  UNAVAILABLE: "This promo cannot be applied right now.",
} as const;

export type PromoCustomerErrorCode = keyof typeof PROMO_CUSTOMER_MESSAGES;
