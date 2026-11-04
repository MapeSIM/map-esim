import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

// GET: Admin manual payment settings fetch karne ke liye
export async function GET() {
  try {
    // Agar aap database ya settings table use kar rahe hain, yahan se fetch karein
    // Filhal hum environment variables ya default settings return kar rahe hain
    const settings = {
      MANUAL_PAYMENTS_ENABLED: process.env.MANUAL_PAYMENTS_ENABLED || "true",
      MANUAL_ACCOUNT_TITLE: process.env.MANUAL_ACCOUNT_TITLE || "MAP eSIM",
      JAZZCASH_NUMBER: process.env.JAZZCASH_NUMBER || "",
      EASYPAISA_NUMBER: process.env.EASYPAISA_NUMBER || "",
      BANK_NAME: process.env.BANK_NAME || "",
      BANK_ACCOUNT_TITLE: process.env.BANK_ACCOUNT_TITLE || "",
      BANK_ACCOUNT_NUMBER: process.env.BANK_ACCOUNT_NUMBER || "",
    };

    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}