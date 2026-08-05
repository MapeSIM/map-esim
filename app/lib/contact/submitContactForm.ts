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
  // Honeypot — bots fill hidden fields; humans leave this empty.
  const honeypot = readField(formData, "company");
  if (honeypot) {
    return { status: "success" };
  }

  const name = readField(formData, "name");
  const email = readField(formData, "email").toLowerCase();
  const subject = readField(formData, "subject");
  const message = readField(formData, "message");

  if (
    name.length < CONTACT_NAME_MIN ||
    name.length > CONTACT_NAME_MAX ||
    email.length === 0 ||
    email.length > CONTACT_EMAIL_MAX ||
    !isValidEmail(email) ||
    subject.length < CONTACT_SUBJECT_MIN ||
    subject.length > CONTACT_SUBJECT_MAX ||
    message.length < CONTACT_MESSAGE_MIN ||
    message.length > CONTACT_MESSAGE_MAX
  ) {
    return {
      status: "error",
      code: "validation",
      message:
        "Please check your name, email, subject and message, then try again.",
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
    };
  }

  const contentKey = createHash("sha256")
    .update(`${email}\n${subject}\n${message}`)
    .digest("hex");
  const dedupe = assertContactNotDuplicate(contentKey);
  if (!dedupe.ok) {
    return {
      status: "error",
      code: "duplicate",
      message:
        "This message was already submitted. If you still need help, email support or wait before sending again.",
    };
  }

  const result = await sendContactFormEmail({
    customerName: name,
    customerEmail: email,
    subject,
    message,
  });

  if (!result.ok) {
    if (result.reason === "not_configured") {
      return {
        status: "error",
        code: "not_configured",
        message:
          "Contact email is temporarily unavailable. Please use the support email address on this page.",
      };
    }
    return {
      status: "error",
      code: "send_failed",
      message:
        "We could not send your message right now. Please try again later or email support directly.",
    };
  }

  return { status: "success" };
}
