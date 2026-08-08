import type { Metadata } from "next";
import { BRAND_NAME } from "@/app/lib/brand";
import { resolveDestinationForSeo } from "@/app/lib/seo/destinationCatalog";
import { destinationPath } from "@/app/lib/vesim/destinations";

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
  const title = `${destination.name} eSIM | ${BRAND_NAME}`;
  const description = `Travel data eSIM plans for ${destination.name} from ${BRAND_NAME}.`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: BRAND_NAME,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default function CountryDetailLayout({ children }: CountryLayoutProps) {
  return children;
}
