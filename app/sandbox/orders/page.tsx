import SandboxOrdersClient from "@/app/components/sandbox/SandboxOrdersClient";

export default async function SandboxOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab =
    (params.tab ?? "orders").trim().toLowerCase() === "performance"
      ? "performance"
      : "orders";
  return <SandboxOrdersClient tab={tab} />;
}
