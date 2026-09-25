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

/** Kid view's four (K2, 25 September): their day, the family chat, the
 * journal, and the family tree and profiles. Money, the household's running
 * and the planner's grown-up side are not on it. */
const KID_TABS: typeof TABS = [
  { href: "/today", label: "Today", icon: "layoutGrid", home: true },
  { href: "/chat", label: "Chat", icon: "message" },
  { href: "/journal", label: "Journal", icon: "images" },
  { href: "/family", label: "Family", icon: "users" },
];

/** One set of links that reads as two different pieces of furniture.
 *
 * On a phone it is the bottom tab bar it always was. From 1024px up the same
 * markup becomes a left sidebar — because a bottom bar on a desktop puts the
 * navigation as far from the cursor as the screen allows, and wastes the one
 * axis a desktop has going spare. Nothing is duplicated or conditionally
 * rendered to do it: the layout is entirely CSS, so there is no second copy
 * to keep in step and no flash of the wrong shape before hydration. */
export function TabBar({ chatUnread = 0, chatMentioned = false, kidView = false }: { chatUnread?: number; chatMentioned?: boolean; kidView?: boolean }) {
  const tabs = kidView ? KID_TABS : TABS;
  const pathname = usePathname();
  return (
    /* Fixed to the viewport, not sticky: a sticky element can only travel
       inside its own parent, and this bar's wrapper is exactly as tall as the
       bar, so it had nowhere to stick and simply sat at the end of the page. */
    <nav className="kin-nav kin-glass-bar">
      {/* Only ever seen on the sidebar. A phone has no room to spend on a
          wordmark, and the tab bar is not where you put one anyway. */}
      <div className="kin-nav-brand">Kin</div>

      <div className="kin-nav-inner">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          const unread = t.href === "/chat" && chatUnread > 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`kin-tab${t.home ? " kin-tab-home" : ""}`}
              data-active={active}
              aria-current={active ? "page" : undefined}
              aria-label={unread ? `${t.label}, ${chatUnread} unread` : t.label}
            >
              <span className="kin-tab-ico">
                {t.home ? (
                  <span className="kin-tab-disc">
                    <Icon name={t.icon} size="var(--kin-tab-disc-icon)" />
                  </span>
                ) : (
                  /* The size is a variable rather than a number because the
                     bar has three shapes — phone, icon-only at large text,
                     sidebar — and only the stylesheet knows which is showing.
                     26 and 23 are still what it resolves to by default. */
                  <Icon name={t.icon} size="var(--kin-tab-icon)" />
                )}

                {/* Unread: a count, and a different tint when one of them
                    named you — the difference between the room talking and
                    someone talking to you. */}
                {unread && (
                  <span className="kin-tab-badge" data-mentioned={chatMentioned}>
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </span>
              <span className="kin-tab-label">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
