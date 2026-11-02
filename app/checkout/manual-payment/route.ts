import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/app/lib/email';

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

    // 1. Order database mein save karein (Pending Verification status ke sath)
    const order = await prisma.order.create({
      data: {
        customerEmail,
        offerId,
        countryCode: country || null,
        status: 'PENDING_MANUAL_VERIFICATION',
        paymentMethod: 'MANUAL',
        senderName,
        paymentProofUrl: proofUrl,
      },
    });

    // 2. Admin ko email notification bhejein
    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@mapesim.com',
        subject: `🔔 New Manual Payment Submitted - Order ID: ${order.id}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; background: #f9f9f9; border-radius: 10px;">
            <h2 style="color: #4f46e5;">New Manual Payment Pending Verification</h2>
            <p>A customer has submitted manual payment details on MAP eSIM.</p>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Order ID:</strong> ${order.id}</li>
              <li><strong>Customer Email:</strong> ${customerEmail}</li>
              <li><strong>Offer ID:</strong> ${offerId}</li>
              <li><strong>Sender Name/Details:</strong> ${senderName}</li>
            </ul>
            <p><strong>Payment Proof:</strong> <a href="${proofUrl}" target="_blank">View Uploaded Screenshot</a></p>
            <p style="margin-top: 20px;">Please log in to your <a href="https://mapesim.com/admin/operations" style="color: #4f46e5; font-weight: bold;">Admin Dashboard</a> to verify the payment and issue the eSIM.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Failed to send admin email notification:', emailErr);
    }

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error: any) {
    console.error('Manual payment checkout error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to submit manual payment' 
    }, { status: 500 });
  }
}