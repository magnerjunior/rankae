import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/legal-document";
import { isLegalDocumentSlug, legalDrafts } from "@/content/legal";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(legalDrafts).map((document) => ({ document }));
}

export async function generateMetadata({ params }: { params: Promise<{ document: string }> }): Promise<Metadata> {
  const { document } = await params;
  if (!isLegalDocumentSlug(document)) return {};
  return { title: `${legalDrafts[document].title} · Rankaê`, robots: { index: false, follow: false } };
}

export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!isLegalDocumentSlug(document)) notFound();
  return <LegalDocument document={legalDrafts[document]} />;
}
