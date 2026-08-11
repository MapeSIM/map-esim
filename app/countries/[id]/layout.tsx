import type { Metadata } from "next";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import { resolveDestinationForSeo } from "@/app/lib/seo/destinationCatalog";
import { destinationPath } from "@/app/lib/vesim/destinations";
import { destinationDisplayName } from "@/app/lib/vesim/destinationPresentation";

type CountryLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: CountryLayoutProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) {
    return {
      title: `eSIM Destination | ${BRAND_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const destination = await resolveDestinationForSeo(id);
  if (!destination) {
    return {
      title: `Destination not found | ${BRAND_NAME}`,
      description: "This eSIM destination is not available.",
      robots: { index: false, follow: false },
    };
  }

  const path = destinationPath(destination);
  const canonical = absoluteCanonical(path);
  const label = destinationDisplayName(destination);
  const title = `${label} eSIM | ${BRAND_NAME}`;
  const description = `Travel data eSIM plans for ${label} from ${BRAND_NAME}.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: BRAND_NAME,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default function CountryDetailLayout({ children }: CountryLayoutProps) {
  return children;
}
