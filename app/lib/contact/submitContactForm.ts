"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_NAME_MAX,
  CONTACT_NAME_MIN,
  CONTACT_SUBJECT_MAX,
  CONTACT_SUBJECT_MIN,
} from "@/app/lib/contact/contactLimits";
import {
  assertContactNotDuplicate,
  assertContactRateLimit,
} from "@/app/lib/contact/contactRateLimit";
import { sendContactFormEmail } from "@/app/lib/email/sendContactFormEmail";
import { isValidEmail } from "@/app/lib/vesim/server";

export type ContactFormValues = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export type ContactFormState =
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
      fieldErrors?: Partial<Record<keyof ContactFormValues, string>>;
      values?: ContactFormValues;
    };

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function clientKeyFromHeaders(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headerList.get("x-real-ip")?.trim();
  const raw = forwarded || realIp || "unknown";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function submitContactFormAction(
  _prev: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const honeypot = readField(formData, "fax_number");
  if (honeypot) {
    return { status: "success" };
  }

  const values: ContactFormValues = {
    name: readField(formData, "name"),
    email: readField(formData, "email").toLowerCase(),
    subject: readField(formData, "subject"),
    message: readField(formData, "message"),
  };

  const fieldErrors: Partial<Record<keyof ContactFormValues, string>> = {};

  if (
    values.name.length < CONTACT_NAME_MIN ||
    values.name.length > CONTACT_NAME_MAX
  ) {
    fieldErrors.name = `Enter your name (at least ${CONTACT_NAME_MIN} characters).`;
  }
  if (
    !values.email ||
    values.email.length > CONTACT_EMAIL_MAX ||
    !isValidEmail(values.email)
  ) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (
    values.subject.length < CONTACT_SUBJECT_MIN ||
    values.subject.length > CONTACT_SUBJECT_MAX
  ) {
    fieldErrors.subject = `Enter a subject (at least ${CONTACT_SUBJECT_MIN} characters).`;
  }
  if (
    values.message.length < CONTACT_MESSAGE_MIN ||
    values.message.length > CONTACT_MESSAGE_MAX
  ) {
    fieldErrors.message = `Enter a message of ${CONTACT_MESSAGE_MIN}–${CONTACT_MESSAGE_MAX} characters.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      code: "validation",
      message: "Please check the highlighted fields and try again.",
      fieldErrors,
      values,
    };
  }

  const headerList = await headers();
  const ipKey = clientKeyFromHeaders(headerList);
  const rate = assertContactRateLimit(ipKey);
  if (!rate.ok) {
    return {
      status: "error",
      code: "rate_limited",
      message:
        "Too many messages were sent recently. Please wait and try again later, or email support directly.",
      values,
    };
  }

  const contentKey = createHash("sha256")
    .update(`${values.email}\n${values.subject}\n${values.message}`)
    .digest("hex");
  const dedupe = assertContactNotDuplicate(contentKey);
  if (!dedupe.ok) {
    return {
      status: "error",
      code: "duplicate",
      message:
        "This message was already submitted. If you still need help, email support or wait before sending again.",
      values,
    };
  }

  const result = await sendContactFormEmail({
    customerName: values.name,
    customerEmail: values.email,
    subject: values.subject,
    message: values.message,
  });

  if (!result.ok) {
    if (result.reason === "not_configured") {
      return {
        status: "error",
        code: "not_configured",
        message:
          "Contact email is temporarily unavailable. Please use the support email address on this page.",
        values,
      };
    }
    return {
      status: "error",
      code: "send_failed",
      message:
        "We could not send your message right now. Please try again later or email support directly.",
      values,
    };
  }

  return { status: "success" };
}
