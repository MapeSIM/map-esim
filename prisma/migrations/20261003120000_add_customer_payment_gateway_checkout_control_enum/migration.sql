-- Customer payment gateway checkout pause control (enum only).
-- Postgres requires new enum values to be committed before use in INSERT.
ALTER TYPE "OperationalControlKey" ADD VALUE 'CUSTOMER_PAYMENT_GATEWAY_CHECKOUT';
