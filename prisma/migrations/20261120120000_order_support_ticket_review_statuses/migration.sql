-- Add IN_REVIEW / INFO_REQUIRED to OrderSupportTicketStatus for admin progress flow.
ALTER TYPE "OrderSupportTicketStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';
ALTER TYPE "OrderSupportTicketStatus" ADD VALUE IF NOT EXISTS 'INFO_REQUIRED';
