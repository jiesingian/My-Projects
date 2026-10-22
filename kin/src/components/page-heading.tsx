"use client";

import { usePathname } from "next/navigation";

/** The page's level-one heading, for screen readers: each section's visible
 * title is an h2 styled for its own page, so the h1 that names the section
 * is read but not shown (WCAG 1.3.1 and 2.4.6; axe page-has-heading-one,
 * final design check, 22 October). */
const NAMES: Record<string, string> = {
  today: "Today",
  planner: "Planner",
  chat: "Chat",
  wealth: "Wealth",
  household: "Household",
  journal: "Journal",
  family: "Family",
  notes: "Notes",
  settings: "Settings",
};

export function PageHeading() {
  // Only a section's own page: deeper pages (a member, a gift list) carry
  // their own visible h1.
  const parts = usePathname().split("/").filter(Boolean);
  const name = parts.length === 1 ? NAMES[parts[0]] : undefined;
  if (!name) return null;
  return <h1 className="sr-only">{name}</h1>;
}
