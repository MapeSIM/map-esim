/**
 * Partner payment return UX mapping from durable purchase/attempt statuses.
 * Browser query params must never be passed here. Never funds or calls VeSIM.
 */
import {
  resolveEsimPaymentReturnKind,
  type EsimPaymentReturnKind,
} from "@/app/lib/esim/esimPurchasePaymentReturnState";

export type PartnerPaymentReturnKind = EsimPaymentReturnKind | "invalid";

export function resolvePartnerPaymentReturnKind(input: {
  purchaseStatus: string;
  attemptStatus: string;
}): EsimPaymentReturnKind {
  return resolveEsimPaymentReturnKind(input);
}

export function partnerEsimPurchasePaymentOrdersHref(): string {
  return "/partner/orders";
}

export function partnerEsimPurchasePaymentCatalogHref(): string {
  return "/countries";
}
