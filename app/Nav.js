"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Jobs" },
  { href: "/board", label: "Board" },
  { href: "/studio", label: "Resume Studio" },
  { href: "/outreach", label: "Outreach" },
];

export default function Nav() {
  const path = usePathname();
  const active = (href) => (href === "/" ? path === "/" || path.startsWith("/jobs") : path.startsWith(href));
  return (
    <nav className="topNav">
      <Link href="/" className="topNavBrand">
        Job Pipeline
      </Link>
      <div className="topNavLinks">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`topNavLink ${active(l.href) ? "active" : ""}`}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
