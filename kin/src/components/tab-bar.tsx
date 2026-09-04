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
    <nav
      className="kin-glass-bar"
      style={{
        borderTop: "1px solid var(--color-divider)",
        padding: "8px 8px calc(env(safe-area-inset-bottom, 0px) + 8px)",
        display: "flex",
        position: "sticky",
        bottom: 0,
        zIndex: 20,
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
    </nav>
  );
}
