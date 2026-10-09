"use client";

import { createContext, useContext } from "react";
import { currencySymbol } from "@/lib/format";

/** The household's currency (families.currency) for client components that
 * are not handed it as a prop -- the Wealth forms' "Amount (₱)" labels were
 * written for pesos only. Set once by the (app) layout. */
const Currency = createContext<string>("PHP");

export function HouseholdCurrencyProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  return <Currency.Provider value={currency}>{children}</Currency.Provider>;
}

/** "₱", "$", "£" ... for the household's currency. */
export function useCurrencySymbol(): string {
  return currencySymbol(useContext(Currency));
}
