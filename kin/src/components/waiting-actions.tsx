"use client";

import dynamic from "next/dynamic";

/* The money controls a "Waiting on you" sheet or row may hold, loaded when
 * one is shown rather than with the page (29 October): Planner shows the
 * list, and the whole of money-actions.tsx put it over its bundle budget. */
const load = () => import("@/components/money-actions");
export const PendingRows = dynamic(() => load().then((m) => m.PendingRows));
export const PayBillControl = dynamic(() => load().then((m) => m.PayBillControl));
export const ReceiveIncomeControl = dynamic(() => load().then((m) => m.ReceiveIncomeControl));
export const GoalContributeControl = dynamic(() => load().then((m) => m.GoalContributeControl));
export const RepriceLoanControl = dynamic(() => load().then((m) => m.RepriceLoanControl));
export const SetBalanceButton = dynamic(() => load().then((m) => m.SetBalanceButton));
export const AddRunningCostControl = dynamic(() => load().then((m) => m.AddRunningCostControl));
export const EditSavingsGoalButton = dynamic(() => load().then((m) => m.EditSavingsGoalButton));
export const FundPaidControl = dynamic(() => load().then((m) => m.FundPaidControl));
export const LoanAssetPicker = dynamic(() => import("@/components/loan-asset-picker").then((m) => m.LoanAssetPicker));
