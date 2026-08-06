-- Add ALERT_NOTIFICATIONS to operational control enum (standalone for Postgres enum rules).
ALTER TYPE "OperationalControlKey" ADD VALUE 'ALERT_NOTIFICATIONS';
