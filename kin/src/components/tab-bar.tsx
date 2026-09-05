"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

/** Today sits in the middle because it is where the app opens and where you
 * come back to. The people side of the house is to its left, the things
 * being run to its right. */
const TABS: { href: string; label: string; icon: IconName; home?: boolean }[] = [
  { href: "/family", label: "Family", icon: "users" },
  { href: "/chat", label: "Chat", icon: "message" },
  { href: "/journal", label: "Journal", icon: "images" },
  { href: "/today", label: "Today", icon: "layoutGrid", home: true },
  { href: "/planner", label: "Planner", icon: "calendarDays" },
  { href: "/household", label: "Household", icon: "house" },
  { href: "/wealth", label: "Wealth", icon: "wallet" },
];

export function TabBar({ chatUnread = 0, chatMentioned = false }: { chatUnread?: number; chatMentioned?: boolean }) {
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
          padding: "8px 6px calc(env(safe-area-inset-bottom, 0px) + 8px)",
        }}
      >
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          const unread = t.href === "/chat" && chatUnread > 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`kin-tab${t.home ? " kin-tab-home" : ""}`}
              data-active={active}
              aria-label={unread ? `${t.label}, ${chatUnread} unread` : t.label}
            >
              <span style={{ position: "relative", display: "flex" }}>
                {t.home ? (
                  <span className="kin-tab-disc">
                    <Icon name={t.icon} size={26} />
                  </span>
                ) : (
                  <Icon name={t.icon} size={23} />
                )}

                {/* Unread: a count, and a different tint when one of them
                    named you — the difference between the room talking and
                    someone talking to you. */}
                {unread && (
                  <span
                    style={{
                      position: "absolute",
                      top: -5,
                      left: 12,
                      minWidth: 16,
                      height: 16,
                      padding: "0 4px",
                      borderRadius: 999,
                      background: chatMentioned ? "var(--cal-occasion)" : "var(--color-accent)",
                      color: "#fff",
                      font: "600 10px/16px var(--font-body)",
                      textAlign: "center",
                    }}
                  >
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </span>
              {/* 10px is the platform's tab label size; seven tabs crowd
                  above that, so the label rides just under it at 9.5. */}
              <span style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: "-0.01em" }}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
