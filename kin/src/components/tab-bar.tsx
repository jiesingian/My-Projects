"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/today", label: "Today", icon: "layoutGrid" },
  { href: "/family", label: "Family", icon: "users" },
  { href: "/journal", label: "Journal", icon: "images" },
  { href: "/planner", label: "Planner", icon: "calendarDays" },
  { href: "/household", label: "Household", icon: "house" },
  { href: "/wealth", label: "Wealth", icon: "wallet" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    /* Fixed to the viewport, not sticky: a sticky element can only travel
       inside its own parent, and this bar's wrapper is exactly as tall as the
       bar, so it had nowhere to stick and simply sat at the end of the page. */
    <nav
      className="kin-glass-bar"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        borderTop: "1px solid var(--color-divider)",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
          padding: "8px 8px calc(env(safe-area-inset-bottom, 0px) + 8px)",
        }}
      >
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link key={t.href} href={t.href} className="kin-tab" data-active={active}>
              <Icon name={t.icon} size={24} />
              {/* 10px is the platform's tab label size; six tabs crowd above that. */}
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "-0.005em" }}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
