import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createManualPendingOrderFromGuest,
  createManualPendingOrderFromPurchase,
} from "@/app/lib/esim/manualCheckoutOrder";
import { notifyManualPaymentSubmissionEmails } from "@/app/lib/esim/manualPaymentSubmissionEmail";
import {
  GUEST_CHECKOUT_UNAVAILABLE_MESSAGE,
  isGuestVesimCheckoutEnabled,
} from "@/app/lib/vesim/guestCheckoutGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Submit a Manual Payment checkout (JazzCash / EasyPaisa / bank).
 * Persists a PENDING local order + admin fulfillable pending row when possible.
 * Never calls VeSIM here — admin Verify & Issue triggers fulfillment.
 * Emails are awaited (bounded) after durable persist so serverless does not
 * exit mid-send; SMTP failure never rolls back the order.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 }
    );
  }

  const purchaseId =
    typeof body.purchaseId === "string" ? body.purchaseId.trim() : "";
  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const customerEmail =
    typeof body.customerEmail === "string" ? body.customerEmail.trim() : "";
  const senderName =
    typeof body.senderName === "string" ? body.senderName.trim() : "";
  const proofUrl =
    typeof body.proofUrl === "string"
      ? body.proofUrl.trim()
      : typeof body.paymentProofUrl === "string"
        ? body.paymentProofUrl.trim()
        : "";
  const country =
    typeof body.country === "string" ? body.country.trim() : null;

  try {
    if (purchaseId) {
      const session = await auth();
      const userId = session?.user?.id?.trim() ?? "";
      if (!userId) {
        return NextResponse.json(
          { success: false, error: "Please sign in to continue." },
          { status: 401 }
        );
      }

      const result = await createManualPendingOrderFromPurchase({
        customerUserId: userId,
        purchaseId,
        senderName,
        proofUrl,
      });
      if (!result.success) {
        return NextResponse.json(result, { status: 400 });
      }

      await notifyManualPaymentSubmissionEmails({
        orderId: result.orderId,
        reference: result.reference,
      });

      return NextResponse.json({
        success: true,
        pendingOrderId: result.pendingOrderId,
        orderId: result.orderId,
        reference: result.reference,
        purchaseId: result.purchaseId,
      });
    }

    if (!offerId || !customerEmail) {
      return NextResponse.json(
        {
          success: false,
          error:
            "All fields including payment proof screenshot are required",
        },
        { status: 400 }
      );
    }

    // Guest (unauthenticated offerId) path — blocked when admin disables guest checkout.
    if (!(await isGuestVesimCheckoutEnabled())) {
      return NextResponse.json(
        { success: false, error: GUEST_CHECKOUT_UNAVAILABLE_MESSAGE },
        { status: 503 }
      );
    }

    const result = await createManualPendingOrderFromGuest({
      offerId,
      customerEmail,
      senderName,
      proofUrl,
      countryHint: country,
    });
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    await notifyManualPaymentSubmissionEmails({
      orderId: result.orderId,
      reference: result.reference,
    });

    return NextResponse.json({
      success: true,
      pendingOrderId: result.pendingOrderId,
      orderId: result.orderId,
      reference: result.reference,
    });
  } catch (error) {
    console.error(
      "manual_payment_checkout",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to submit manual payment. Please try again.",
      },
      { status: 500 }
    );
  }
}
