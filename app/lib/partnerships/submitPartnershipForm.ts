"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { sendPartnershipFormEmail } from "@/app/lib/email/sendPartnershipFormEmail";
import {
  PARTNERSHIP_ABOUT_MAX,
  PARTNERSHIP_ABOUT_MIN,
  PARTNERSHIP_COMPANY_MAX,
  PARTNERSHIP_COMPANY_MIN,
  PARTNERSHIP_COUNTRY_MAX,
  PARTNERSHIP_COUNTRY_MIN,
  PARTNERSHIP_EMAIL_MAX,
  PARTNERSHIP_NAME_MAX,
  PARTNERSHIP_NAME_MIN,
  PARTNERSHIP_PHONE_MAX,
  PARTNERSHIP_PHONE_MIN,
  PARTNERSHIP_POSTAL_MAX,
  PARTNERSHIP_POSTAL_MIN,
  PARTNERSHIP_REGISTRATION_MAX,
  PARTNERSHIP_WEBSITE_MAX,
  parsePartnershipVolume,
} from "@/app/lib/partnerships/partnershipLimits";
import {
  assertPartnershipNotDuplicate,
  assertPartnershipRateLimit,
} from "@/app/lib/partnerships/partnershipRateLimit";
import { isValidEmail } from "@/app/lib/vesim/server";

export type PartnershipFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      code:
        | "validation"
        | "rate_limited"
        | "duplicate"
        | "not_configured"
        | "send_failed";
      message: string;
      fieldErrors?: Partial<
        Record<
          | "fullName"
          | "companyName"
          | "registrationNumber"
          | "businessEmail"
          | "phone"
          | "country"
          | "postalCode"
          | "website"
          | "about"
          | "expectedVolume",
          string
        >
      >;
    };

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function clientKeyFromHeaders(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headerList.get("x-real-ip")?.trim();
  const raw = forwarded || realIp || "unknown";
  return createHash("sha256").update(`partnership:${raw}`).digest("hex").slice(0, 32);
}

function looksLikeUrlOrHandle(value: string): boolean {
  if (!value) return true;
  if (value.length > PARTNERSHIP_WEBSITE_MAX) return false;
  // Allow http(s) URLs or simple social handles / domains without inventing more rules.
  return /^(https?:\/\/|www\.|[A-Za-z0-9][\w.-]*\.[A-Za-z]{2,}|@[\w.]+)/i.test(
    value
  );
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return (
    digits.length >= PARTNERSHIP_PHONE_MIN &&
    digits.length <= PARTNERSHIP_PHONE_MAX &&
    /^[+\d][\d\s().-]{5,}$/.test(value)
  );
}

export async function submitPartnershipFormAction(
  _prev: PartnershipFormState,
  formData: FormData
): Promise<PartnershipFormState> {
  // Honeypot — bots fill hidden fields; humans leave this empty.
  // Do not reuse real field names (companyName is legitimate).
  const honeypot = readField(formData, "fax_number");
  if (honeypot) {
    return { status: "success" };
  }

  const fullName = readField(formData, "fullName");
  const companyName = readField(formData, "companyName");
  const registrationNumber = readField(formData, "registrationNumber");
  const businessEmail = readField(formData, "businessEmail").toLowerCase();
  const phone = readField(formData, "phone");
  const country = readField(formData, "country");
  const postalCode = readField(formData, "postalCode");
  const website = readField(formData, "website");
  const about = readField(formData, "about");
  const expectedVolume = parsePartnershipVolume(formData.get("expectedVolume"));

  const fieldErrors: NonNullable<
    Extract<PartnershipFormState, { status: "error" }>["fieldErrors"]
  > = {};

  if (
    fullName.length < PARTNERSHIP_NAME_MIN ||
    fullName.length > PARTNERSHIP_NAME_MAX
  ) {
    fieldErrors.fullName = "Enter your full name.";
  }
  if (
    companyName.length < PARTNERSHIP_COMPANY_MIN ||
    companyName.length > PARTNERSHIP_COMPANY_MAX
  ) {
    fieldErrors.companyName = "Enter your business or company name.";
  }
  if (registrationNumber.length > PARTNERSHIP_REGISTRATION_MAX) {
    fieldErrors.registrationNumber = "Registration number is too long.";
  }
  if (
    !businessEmail ||
    businessEmail.length > PARTNERSHIP_EMAIL_MAX ||
    !isValidEmail(businessEmail)
  ) {
    fieldErrors.businessEmail = "Enter a valid business email.";
  }
  if (!looksLikePhone(phone) || phone.length > PARTNERSHIP_PHONE_MAX) {
    fieldErrors.phone = "Enter a valid phone number.";
  }
  if (
    country.length < PARTNERSHIP_COUNTRY_MIN ||
    country.length > PARTNERSHIP_COUNTRY_MAX
  ) {
    fieldErrors.country = "Enter your country.";
  }
  if (
    postalCode.length < PARTNERSHIP_POSTAL_MIN ||
    postalCode.length > PARTNERSHIP_POSTAL_MAX
  ) {
    fieldErrors.postalCode = "Enter a ZIP / postal code.";
  }
  if (website && !looksLikeUrlOrHandle(website)) {
    fieldErrors.website = "Enter a website URL or social profile.";
  }
  if (
    about.length < PARTNERSHIP_ABOUT_MIN ||
    about.length > PARTNERSHIP_ABOUT_MAX
  ) {
    fieldErrors.about =
      "Tell us a little more about your business or audience.";
  }
  if (!expectedVolume) {
    fieldErrors.expectedVolume = "Select an expected monthly volume.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      code: "validation",
      message: "Please check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const headerList = await headers();
  const ipKey = clientKeyFromHeaders(headerList);
  const rate = assertPartnershipRateLimit(ipKey);
  if (!rate.ok) {
    return {
      status: "error",
      code: "rate_limited",
      message:
        "Too many applications were sent recently. Please wait and try again later, or email support directly.",
    };
  }

  const contentKey = createHash("sha256")
    .update(
      `${businessEmail}\n${companyName}\n${about}\n${expectedVolume}`
    )
    .digest("hex");
  const dedupe = assertPartnershipNotDuplicate(contentKey);
  if (!dedupe.ok) {
    return {
      status: "error",
      code: "duplicate",
      message:
        "This application was already submitted. If you still need help, email support or wait before sending again.",
    };
  }

  const result = await sendPartnershipFormEmail({
    fullName,
    companyName,
    registrationNumber,
    businessEmail,
    phone,
    country,
    postalCode,
    website,
    about,
    expectedVolume: expectedVolume!,
  });

  if (!result.ok) {
    if (result.reason === "not_configured") {
      return {
        status: "error",
        code: "not_configured",
        message:
          "Partnership email is temporarily unavailable. Please use the support email address on this page.",
      };
    }
    return {
      status: "error",
      code: "send_failed",
      message:
        "We could not send your application right now. Please try again later or email support directly.",
    };
  }

  return { status: "success" };
}
