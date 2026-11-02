import { sendEmail } from '@/app/lib/email'; // Aapke project ka email sender utility

// Jab customer manual payment submit karay:
await sendEmail({
  to: 'admin@mapesim.com', // Aapka admin email address
  subject: `🔔 New Manual Payment Submitted - Reference: ${orderReference}`,
  html: `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2>New Manual Payment Pending Verification</h2>
      <p>A customer has submitted manual payment details for review.</p>
      <ul>
        <li><strong>Reference:</strong> ${orderReference}</li>
        <li><strong>Customer Email:</strong> ${customerEmail}</li>
        <li><strong>Package:</strong> ${packageName}</li>
        <li><strong>Amount:</strong> $${amount}</li>
        <li><strong>Sender Name:</strong> ${senderName}</li>
      </ul>
      <p>Please log in to the <a href="https://mapesim.com/admin/whatsapp-orders">Admin Dashboard</a> to verify the payment and issue the eSIM.</p>
    </div>
  `
});