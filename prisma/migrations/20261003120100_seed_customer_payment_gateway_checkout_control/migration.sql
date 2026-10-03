-- Seed CUSTOMER_PAYMENT_GATEWAY_CHECKOUT control as ACTIVE (paused=false).
INSERT INTO "OperationalControl" ("id", "key", "paused", "version", "reason", "updatedByAdminId", "createdAt", "updatedAt")
VALUES
  ('opsctl_customer_payment_gateway_checkout', 'CUSTOMER_PAYMENT_GATEWAY_CHECKOUT', false, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
