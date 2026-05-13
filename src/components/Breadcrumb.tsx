"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  items: Crumb[];
  showHome?: boolean;
};

const SITE_URL = "https://heyblip.au";

export default function Breadcrumb({ items, showHome = true }: Props) {
  const trail: Crumb[] = showHome ? [{ label: "Home", href: "/" }, ...items] : items;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: c.href ? `${SITE_URL}${c.href}` : undefined,
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className="max-w-5xl mx-auto px-6 pt-28 md:pt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ol className="flex items-center flex-wrap gap-1.5 text-xs md:text-sm text-[var(--muted)]">
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight
                  size={14}
                  strokeWidth={1.5}
                  className="text-[var(--muted)] opacity-60"
                  aria-hidden="true"
                />
              )}
              {isLast || !crumb.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className="text-[var(--muted-strong)]"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-[var(--foreground)] transition-colors duration-200"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
