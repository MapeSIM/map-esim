import SandboxOrderDetailClient from "@/app/components/sandbox/SandboxOrderDetailClient";

export const dynamic = "force-dynamic";

export default async function SandboxOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  return <SandboxOrderDetailClient orderId={orderId} />;
}
