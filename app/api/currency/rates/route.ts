import { NextResponse } from "next/server";
import {
  CURRENCY_CODES,
  FALLBACK_USD_RATES,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";

export async function GET() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 60 * 60 * 6 },
    });

    if (!response.ok) {
      throw new Error("FX provider request failed");
    }

    const data = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };

    if (data.result !== "success" || !data.rates) {
      throw new Error("FX provider returned an invalid payload");
    }

    const rates = Object.fromEntries(
      CURRENCY_CODES.map((code) => [
        code,
        typeof data.rates?.[code] === "number" && data.rates[code] > 0
          ? data.rates[code]
          : FALLBACK_USD_RATES[code],
      ])
    ) as Record<CurrencyCode, number>;

    return NextResponse.json({
      success: true,
      base: "USD",
      source: "exchangerate-api.com",
      rates,
    });
  } catch {
    return NextResponse.json({
      success: true,
      base: "USD",
      source: "fallback",
      rates: FALLBACK_USD_RATES,
    });
  }
}
