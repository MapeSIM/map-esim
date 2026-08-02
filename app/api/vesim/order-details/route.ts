import { NextRequest, NextResponse } from "next/server";
import { getStoredEmailDelivery } from "@/app/lib/email/deliverAfterCheckout";
import {
  buildManualInstallText,
  extractInstallDetails,
  hasInstallDetails,
} from "@/app/lib/email/extract";
import {
  getBrokerToken,
  getVesimBaseUrl,
  publicErrorMessage,
  readJsonSafe,
} from "@/app/lib/vesim/server";

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId")?.trim() || "";

    if (!orderId || orderId.length > 120) {
      return NextResponse.json(
        {
          success: false,
          error: "Order ID is required",
        },
        { status: 400 }
      );
    }

    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();

    const orderResponse = await fetch(
      `${baseUrl}/api/broker/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
        cache: "no-store",
      }
    );

    const orderData = await readJsonSafe(orderResponse);

    if (!orderResponse.ok) {
      console.error("VeSIM order details failed:", orderResponse.status);
      return NextResponse.json(
        {
          success: false,
          error: "Unable to load order details",
        },
        { status: orderResponse.status >= 400 ? orderResponse.status : 502 }
      );
    }

    const payload =
      asRecord(orderData.order) ||
      asRecord(orderData.data) ||
      orderData;

    const install = extractInstallDetails(orderData);
    const emailMeta = getStoredEmailDelivery(orderId);

    const safeOrder = {
      orderId:
        firstString(payload.orderId, payload.id, orderId) || orderId,
      offerId: firstString(payload.offerId, payload.offer_id),
      offerName: firstString(
        payload.offerName,
        payload.name,
        payload.planName
      ),
      countryName: firstString(payload.countryName, payload.country),
      dataFormatted: firstString(
        payload.dataFormatted,
        payload.data,
        payload.dataAllowance
      ),
      durationDays: firstNumber(payload.durationDays, payload.validity),
      priceUSD: firstNumber(
        payload.priceUSD,
        payload.price,
        payload.amount,
        payload.total
      ),
      status: firstString(payload.status),
      iccid: install.iccid,
      smdpAddress: install.smdpAddress,
      activationCode: install.activationCode,
      qrValue: install.qrValue,
      hasInstallDetails: hasInstallDetails(install),
      manualInstallText: hasInstallDetails(install)
        ? buildManualInstallText({
            orderId:
              firstString(payload.orderId, payload.id, orderId) || orderId,
            ...install,
          })
        : undefined,
      emailDelivery: emailMeta.emailDelivery,
      customerEmail: emailMeta.customerEmail,
    };

    return NextResponse.json({
      success: true,
      order: safeOrder,
    });
  } catch (error: unknown) {
    console.error(
      "VeSIM order details error:",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, "Unable to load order details"),
      },
      { status: 500 }
    );
  }
}
