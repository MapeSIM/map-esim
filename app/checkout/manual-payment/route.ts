import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { offerId, customerEmail, senderName, proofUrl, country } = body;

    if (!offerId || !customerEmail || !senderName || !proofUrl) {
      return NextResponse.json({ 
        success: false, 
        error: 'All fields including payment proof screenshot are required' 
      }, { status: 400 });
    }

    // 1. Order database mein save karein (with manual payment fields)
    const order = await prisma.order.create({
      data: {
        providerOrderId: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        customerEmail,
        offerId,
        status: 'PENDING',
        paymentMethod: 'MANUAL',
        senderName,
        paymentProofUrl: proofUrl,
      },
    });

    // 2. Admin notification log
    console.log(`New Manual Payment Submitted - Order ID: ${order.id} by ${customerEmail} - Proof: ${proofUrl}`);

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error: any) {
    console.error('Manual payment checkout error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to submit manual payment' 
    }, { status: 500 });
  }
}