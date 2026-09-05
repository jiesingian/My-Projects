import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { syncRowToCalendars, type CalendarTarget } from "@/lib/actions/calendar-sync";
import { EXPENSE_CATEGORIES, INCOME_SOURCES, signedAmount } from "@/lib/wealth";
import { MARKET_SECTIONS, UNITS, guessSection, formatQuantity } from "@/lib/grocery";
import type { CurrentMember } from "@/lib/session";

/** Every tool the Today assistant can reach. Each one is scoped to the
 * signed-in member's household by the executor — the model never supplies a
 * family id, so it cannot address anyone else's records. */
export const ASSISTANT_TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "search",
    description:
      "Search the household's records by keyword across every hub: activities, events, trips, bills, goals, shopping items, meal plans, journal entries, documents, accounts, assets and liabilities. Use this whenever the member asks where something is, whether something exists, or what they have on a subject.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for, e.g. 'dentist', 'Meralco', 'Baguio'." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_schedule",
    description:
      "List everything with a date in a range — activities, events, trips, bills due, meal plans and goal target dates. Use for 'what's on today/this week', 'when is X', or before scheduling something new.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, YYYY-MM-DD." },
        to: { type: "string", description: "End date inclusive, YYYY-MM-DD." },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_money",
    description:
      "The household's financial position: every account and its balance, this month's money in and out, unpaid bills, goal progress, and what is owned and owed.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_household",
    description: "The open shopping list and this week's meal plans.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_family",
    description: "Who is in the household, plus any health checks that are due.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_activity",
    description:
      "Put something on the calendar — an appointment, a school run, anything happening at a time. Syncs to the tagged members' Google Calendars automatically.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD." },
        start_time: { type: "string", description: "HH:MM, 24-hour. Defaults to 09:00." },
        end_time: { type: "string", description: "HH:MM, 24-hour. Optional." },
        location: { type: "string" },
        notes: { type: "string" },
        whole_family: { type: "boolean", description: "True if it applies to everyone. Defaults to true." },
        member_names: {
          type: "array",
          items: { type: "string" },
          description: "First names of the members it is for, when it isn't the whole family.",
        },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "add_event",
    description: "Record a date that matters — a birthday, anniversary, school event. Birthdays and anniversaries repeat yearly.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD." },
        kind: { type: "string", enum: ["birthday", "anniversary", "school", "health", "other"] },
        note: { type: "string" },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "add_buy_items",
    description:
      "Add one or more items to the household shopping list. Split any quantity the member gives into a number and a unit — '2 kilos of chicken' is quantity 2, unit kg. Leave the section out unless they say where it belongs; it is filed automatically from the item name.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string", enum: [...UNITS] },
              section: { type: "string", enum: [...MARKET_SECTIONS], description: "Where it sits in the market. Omit to file it automatically." },
            },
            required: ["name"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "add_meal_plan",
    description: "Plan a dish for a date, optionally with the ingredients it needs.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD." },
        dish: { type: "string" },
        note: { type: "string" },
        ingredients: { type: "array", items: { type: "string" } },
      },
      required: ["date", "dish"],
    },
  },
  {
    name: "add_bill",
    description: "Track a bill to be paid. It appears in Wealth > Bills and, if dated, on everyone's calendar.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        amount: { type: "number" },
        due_date: { type: "string", description: "YYYY-MM-DD." },
        category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
        recurrence: { type: "string", enum: ["monthly", "quarterly", "yearly", "once"] },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "add_goal",
    description: "Set a savings goal with an amount to reach.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        target_amount: { type: "number" },
        target_date: { type: "string", description: "YYYY-MM-DD." },
        is_joint: { type: "boolean", description: "True for a household goal, false for the member's own. Defaults to true." },
        note: { type: "string" },
      },
      required: ["title", "target_amount"],
    },
  },
  {
    name: "add_journal_entry",
    description: "Write something into the family journal.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        note: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
      required: ["title"],
    },
  },
  {
    name: "add_trip",
    description: "Plan a trip. Syncs to the travellers' calendars.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD." },
        end_date: { type: "string", description: "YYYY-MM-DD." },
        budget: { type: "number" },
        traveller_names: { type: "array", items: { type: "string" }, description: "First names. Omit for the whole family." },
      },
      required: ["title", "start_date"],
    },
  },
  {
    name: "record_money",
    description:
      "Record money that has already moved in or out of one of the household's accounts — salary received, a cash purchase, a gift. Call get_money first if you need the exact account names. This changes a real balance, so only call it when the member has clearly asked to record a specific amount.",
    input_schema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Which account, as named in get_money." },
        direction: { type: "string", enum: ["in", "out"] },
        amount: { type: "number" },
        particulars: { type: "string", description: "What it was for." },
        category: { type: "string", description: `One of ${[...INCOME_SOURCES].join(", ")} for money in, or ${[...EXPENSE_CATEGORIES].join(", ")} for money out.` },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
      required: ["account_name", "direction", "amount", "particulars"],
    },
  },
];

type Json = Record<string, unknown>;

function str(input: Json, key: string): string | null {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(input: Json, key: string): number | null {
  const v = input[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(input: Json, key: string, fallback: boolean): boolean {
  const v = input[key];
  return typeof v === "boolean" ? v : fallback;
}

function list(input: Json, key: string): unknown[] {
  const v = input[key];
  return Array.isArray(v) ? v : [];
}

/** Matches the loose first names the model passes back to real member rows. */
function matchMembers(members: { id: string; full_name: string }[], names: string[]): string[] {
  const wanted = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
  return members
    .filter((m) => {
      const full = m.full_name.toLowerCase();
      const first = full.split(" ")[0];
      return wanted.some((w) => first === w || full === w || full.includes(w));
    })
    .map((m) => m.id);
}

/** Runs one tool call against the household of the member who asked. Returns
 * a compact JSON string for the model — every failure comes back as an
 * `error` field rather than throwing, so the conversation can recover. */
export async function runAssistantTool(name: string, rawInput: unknown, me: CurrentMember): Promise<string> {
  const input = (rawInput ?? {}) as Json;
  const supabase = await createClient();
  const familyId = me.family_id;
  const done = (payload: unknown) => JSON.stringify(payload);
  const fail = (message: string) => JSON.stringify({ error: message });

  const loadMembers = async () => {
    const { data } = await supabase.from("members").select("id, full_name").eq("family_id", familyId);
    return data ?? [];
  };

  switch (name) {
    case "search": {
      const q = str(input, "query");
      if (!q) return fail("Give me something to search for.");
      const like = `%${q}%`;
      const [activities, events, trips, bills, goals, buyItems, meals, journal, docs, accounts, assets] = await Promise.all([
        supabase.from("activities").select("id, title, start_at, location").eq("family_id", familyId).ilike("title", like).limit(8),
        supabase.from("events").select("id, title, event_date, kind").eq("family_id", familyId).ilike("title", like).limit(8),
        supabase.from("trips").select("id, title, start_date, end_date").eq("family_id", familyId).ilike("title", like).limit(8),
        supabase.from("bills").select("id, name, amount, due_date, status").eq("family_id", familyId).ilike("name", like).limit(8),
        supabase.from("goals").select("id, title, target_amount, current_amount, target_date").eq("family_id", familyId).ilike("title", like).limit(8),
        supabase.from("buy_items").select("id, name, quantity, unit, section, checked").eq("family_id", familyId).eq("cleared", false).ilike("name", like).limit(8),
        supabase.from("meal_plans").select("id, dish, plan_date").eq("family_id", familyId).ilike("dish", like).limit(8),
        supabase.from("journal_entries").select("id, title, entry_date").eq("family_id", familyId).ilike("title", like).limit(8),
        supabase.from("doc_entries").select("id, title, expires_at, doc_type").eq("family_id", familyId).ilike("title", like).limit(8),
        supabase.from("accounts").select("id, name, institution").eq("family_id", familyId).eq("is_archived", false).ilike("name", like).limit(8),
        supabase.from("assets").select("id, name, kind, value").eq("family_id", familyId).ilike("name", like).limit(8),
      ]);

      const groups: Json = {};
      const put = (key: string, rows: unknown[] | null) => {
        if (rows && rows.length > 0) groups[key] = rows;
      };
      put("activities", activities.data);
      put("events", events.data);
      put("trips", trips.data);
      put("bills", bills.data);
      put("goals", goals.data);
      put("shopping_list", buyItems.data);
      put("meal_plans", meals.data);
      put("journal", journal.data);
      put("documents", docs.data);
      put("accounts", accounts.data);
      put("assets", assets.data);

      return done(Object.keys(groups).length === 0 ? { matches: "nothing found" } : groups);
    }

    case "get_schedule": {
      const from = str(input, "from");
      const to = str(input, "to");
      if (!from || !to) return fail("Need both from and to dates.");
      const toExclusive = new Date(`${to}T00:00:00`);
      toExclusive.setDate(toExclusive.getDate() + 1);
      const toStr = toExclusive.toISOString().slice(0, 10);

      const [activities, events, trips, bills, meals, goals] = await Promise.all([
        supabase
          .from("activities")
          .select("title, start_at, location, applies_to_whole_family, activity_members(members(full_name))")
          .eq("family_id", familyId)
          .gte("start_at", `${from}T00:00:00`)
          .lt("start_at", `${toStr}T00:00:00`)
          .order("start_at"),
        supabase.from("events").select("title, event_date, kind").eq("family_id", familyId).gte("event_date", from).lt("event_date", toStr),
        supabase.from("trips").select("title, start_date, end_date").eq("family_id", familyId).gte("start_date", from).lt("start_date", toStr),
        supabase.from("bills").select("name, amount, due_date, status").eq("family_id", familyId).gte("due_date", from).lt("due_date", toStr),
        supabase.from("meal_plans").select("dish, plan_date").eq("family_id", familyId).gte("plan_date", from).lt("plan_date", toStr),
        supabase.from("goals").select("title, target_date, target_amount, current_amount").eq("family_id", familyId).gte("target_date", from).lt("target_date", toStr),
      ]);

      return done({
        activities: (activities.data ?? []).map((a) => ({
          title: a.title,
          when: a.start_at,
          location: a.location,
          who: a.applies_to_whole_family
            ? "whole family"
            : (a.activity_members ?? []).map((m) => (m.members as unknown as { full_name: string } | null)?.full_name).filter(Boolean),
        })),
        events: events.data ?? [],
        trips: trips.data ?? [],
        bills_due: bills.data ?? [],
        meals: meals.data ?? [],
        goal_deadlines: goals.data ?? [],
      });
    }

    case "get_money": {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [accountsRes, movementsRes, billsRes, goalsRes, assetsRes, liabilitiesRes] = await Promise.all([
        supabase.from("accounts").select("id, name, institution, opening_balance, is_joint, owner_member_id").eq("family_id", familyId).eq("is_archived", false),
        supabase.from("wealth_transactions").select("account_id, direction, amount, status, occurred_at, particulars, category").eq("family_id", familyId),
        supabase.from("bills").select("name, amount, due_date, status").eq("family_id", familyId).neq("status", "paid"),
        supabase.from("goals").select("title, target_amount, current_amount, target_date").eq("family_id", familyId),
        supabase.from("assets").select("name, value").eq("family_id", familyId),
        supabase.from("liabilities").select("name, balance").eq("family_id", familyId),
      ]);

      const movements = movementsRes.data ?? [];
      const accounts = (accountsRes.data ?? []).map((a) => ({
        name: a.name,
        institution: a.institution,
        scope: a.is_joint ? "joint" : a.owner_member_id === me.id ? "your own" : "another member's, shared with the family",
        balance:
          Number(a.opening_balance) +
          movements.filter((m) => m.account_id === a.id).reduce((sum, m) => sum + signedAmount(m), 0),
      }));

      const thisMonth = movements.filter((m) => m.status === "confirmed" && new Date(m.occurred_at) >= monthStart);
      const assetTotal = (assetsRes.data ?? []).reduce((s, a) => s + Number(a.value), 0);
      const liabilityTotal = (liabilitiesRes.data ?? []).reduce((s, l) => s + Number(l.balance), 0);
      const cash = accounts.reduce((s, a) => s + a.balance, 0);

      return done({
        currency: me.families.currency,
        accounts,
        combined_balance: cash,
        this_month_in: thisMonth.filter((m) => m.direction === "in").reduce((s, m) => s + Number(m.amount), 0),
        this_month_out: thisMonth.filter((m) => m.direction === "out").reduce((s, m) => s + Number(m.amount), 0),
        unpaid_bills: billsRes.data ?? [],
        goals: goalsRes.data ?? [],
        assets_total: assetTotal,
        liabilities_total: liabilityTotal,
        net_worth: cash + assetTotal - liabilityTotal,
        pending_confirmations: movements.filter((m) => m.status === "pending").length,
      });
    }

    case "get_household": {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const [buy, meals] = await Promise.all([
        supabase.from("buy_items").select("name, quantity, unit, section, checked").eq("family_id", familyId).eq("cleared", false),
        supabase
          .from("meal_plans")
          .select("dish, plan_date, note")
          .eq("family_id", familyId)
          .gte("plan_date", weekStart.toISOString().slice(0, 10))
          .lt("plan_date", weekEnd.toISOString().slice(0, 10))
          .order("plan_date"),
      ]);

      return done({
        shopping_list: buy.data ?? [],
        still_to_buy: (buy.data ?? []).filter((b) => !b.checked).length,
        meals_this_week: meals.data ?? [],
      });
    }

    case "get_family": {
      const [members, health] = await Promise.all([
        supabase.from("members").select("full_name, relationship, role, dob, status").eq("family_id", familyId).neq("status", "removed"),
        supabase
          .from("health_schedule")
          .select("what, when_date, status, members(full_name)")
          .eq("family_id", familyId)
          .in("status", ["due", "due_soon"]),
      ]);

      return done({
        members: members.data ?? [],
        health_due: (health.data ?? []).map((h) => ({
          who: (h.members as unknown as { full_name: string } | null)?.full_name,
          what: h.what,
          when: h.when_date,
          status: h.status,
        })),
      });
    }

    case "add_activity": {
      const title = str(input, "title");
      const date = str(input, "date");
      if (!title || !date) return fail("An activity needs a title and a date.");
      const from = str(input, "start_time") ?? "09:00";
      const to = str(input, "end_time");
      const names = list(input, "member_names").filter((n): n is string => typeof n === "string");
      const wholeFamily = names.length > 0 ? bool(input, "whole_family", false) : bool(input, "whole_family", true);

      const members = await loadMembers();
      const memberIds = matchMembers(members, names);
      if (names.length > 0 && memberIds.length === 0) {
        return fail(`Nobody in the household matches ${names.join(", ")}. Members are: ${members.map((m) => m.full_name).join(", ")}.`);
      }

      const { data: activity, error } = await supabase
        .from("activities")
        .insert({
          family_id: familyId,
          title,
          start_at: new Date(`${date}T${from}`).toISOString(),
          end_at: to ? new Date(`${date}T${to}`).toISOString() : null,
          location: str(input, "location"),
          notes: str(input, "notes"),
          applies_to_whole_family: wholeFamily,
          created_by: me.id,
        })
        .select()
        .single();
      if (error) return fail(error.message);

      if (!wholeFamily && memberIds.length > 0) {
        await supabase.from("activity_members").insert(memberIds.map((id) => ({ activity_id: activity.id, member_id: id })));
      }

      await syncRowToCalendars(
        familyId,
        "activities",
        activity.id,
        { title, startAt: new Date(`${date}T${from}`), endAt: to ? new Date(`${date}T${to}`) : null, location: str(input, "location") },
        wholeFamily ? { kind: "all" } : { kind: "members", memberIds },
      );

      return done({ added: "activity", title, date, time: from, who: wholeFamily ? "whole family" : names });
    }

    case "add_event": {
      const title = str(input, "title");
      const date = str(input, "date");
      if (!title || !date) return fail("An event needs a title and a date.");
      const kind = str(input, "kind") ?? "other";

      const { data: event, error } = await supabase
        .from("events")
        .insert({
          family_id: familyId,
          title,
          event_date: date,
          kind,
          sub_note: str(input, "note"),
          recurs_yearly: kind === "birthday" || kind === "anniversary",
          created_by: me.id,
        })
        .select()
        .single();
      if (error) return fail(error.message);

      await syncRowToCalendars(familyId, "events", event.id, { title, startAt: new Date(`${date}T00:00:00`), allDay: true }, { kind: "all" });
      return done({ added: "event", title, date, kind });
    }

    case "add_buy_items": {
      const items = list(input, "items")
        .map((raw) => raw as Json)
        .map((item) => {
          const itemName = str(item, "name");
          if (!itemName) return null;
          const given = str(item, "section");
          return {
            name: itemName,
            quantity: num(item, "quantity"),
            unit: str(item, "unit"),
            section: given && (MARKET_SECTIONS as readonly string[]).includes(given) ? given : guessSection(itemName),
          };
        })
        .filter((item): item is { name: string; quantity: number | null; unit: string | null; section: string } => item !== null);
      if (items.length === 0) return fail("No items to add.");

      const { error } = await supabase.from("buy_items").insert(
        items.map((item) => ({
          family_id: familyId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          section: item.section,
          source: "house",
          created_by: me.id,
        })),
      );
      if (error) return fail(error.message);
      return done({
        added: "shopping items",
        items: items.map((i) => ({ name: i.name, quantity: formatQuantity(i.quantity, i.unit) || undefined, section: i.section })),
      });
    }

    case "add_meal_plan": {
      const date = str(input, "date");
      const dish = str(input, "dish");
      if (!date || !dish) return fail("A meal needs a date and a dish.");

      const { data: plan, error } = await supabase
        .from("meal_plans")
        .insert({ family_id: familyId, plan_date: date, dish, note: str(input, "note"), created_by: me.id })
        .select()
        .single();
      if (error) return fail(error.message);

      const ingredients = list(input, "ingredients").filter((i): i is string => typeof i === "string" && !!i.trim());
      if (ingredients.length > 0) {
        await supabase
          .from("meal_ingredients")
          .insert(ingredients.map((ingredient_name) => ({ meal_plan_id: plan.id, family_id: familyId, ingredient_name })));
      }

      await syncRowToCalendars(familyId, "meal_plans", plan.id, { title: dish, startAt: new Date(`${date}T00:00:00`), allDay: true }, { kind: "all" });
      return done({ added: "meal plan", dish, date, ingredients });
    }

    case "add_bill": {
      const name_ = str(input, "name");
      const amount = num(input, "amount");
      if (!name_ || !amount) return fail("A bill needs a name and an amount.");
      const dueDate = str(input, "due_date");

      const { data: bill, error } = await supabase
        .from("bills")
        .insert({
          family_id: familyId,
          name: name_,
          amount,
          due_date: dueDate,
          category: str(input, "category") ?? "Utilities",
          recurrence: str(input, "recurrence") ?? "monthly",
          status: "unpaid",
          created_by: me.id,
        })
        .select()
        .single();
      if (error) return fail(error.message);

      if (dueDate) {
        await syncRowToCalendars(
          familyId,
          "bills",
          bill.id,
          { title: `${name_} due`, startAt: new Date(`${dueDate}T00:00:00`), allDay: true },
          { kind: "all" },
        );
      }
      return done({ added: "bill", name: name_, amount, due_date: dueDate });
    }

    case "add_goal": {
      const title = str(input, "title");
      const targetAmount = num(input, "target_amount");
      if (!title || !targetAmount) return fail("A goal needs a title and a target amount.");
      const isJoint = bool(input, "is_joint", true);
      const targetDate = str(input, "target_date");

      const { data: goal, error } = await supabase
        .from("goals")
        .insert({
          family_id: familyId,
          title,
          sub_note: str(input, "note"),
          is_joint: isJoint,
          owner_member_id: isJoint ? null : me.id,
          target_amount: targetAmount,
          target_date: targetDate,
          created_by: me.id,
        })
        .select()
        .single();
      if (error) return fail(error.message);

      if (targetDate) {
        const target: CalendarTarget = isJoint ? { kind: "all" } : { kind: "member", memberId: me.id };
        await syncRowToCalendars(familyId, "goals", goal.id, { title, startAt: new Date(`${targetDate}T00:00:00`), allDay: true }, target);
      }
      return done({ added: "goal", title, target_amount: targetAmount, target_date: targetDate });
    }

    case "add_journal_entry": {
      const title = str(input, "title");
      if (!title) return fail("A journal entry needs a title.");
      const entryDate = str(input, "date") ?? new Date().toISOString().slice(0, 10);

      const { error } = await supabase.from("journal_entries").insert({
        family_id: familyId,
        entry_date: entryDate,
        title,
        note: str(input, "note"),
        source: "manual",
        created_by: me.id,
      });
      if (error) return fail(error.message);
      return done({ added: "journal entry", title, date: entryDate });
    }

    case "add_trip": {
      const title = str(input, "title");
      const startDate = str(input, "start_date");
      if (!title || !startDate) return fail("A trip needs a title and a start date.");
      const endDate = str(input, "end_date");
      const names = list(input, "traveller_names").filter((n): n is string => typeof n === "string");

      const members = await loadMembers();
      const travellerIds = matchMembers(members, names);

      const { data: trip, error } = await supabase
        .from("trips")
        .insert({ family_id: familyId, title, start_date: startDate, end_date: endDate, budget_amount: num(input, "budget"), created_by: me.id })
        .select()
        .single();
      if (error) return fail(error.message);

      if (travellerIds.length > 0) {
        await supabase.from("trip_travellers").insert(travellerIds.map((id) => ({ trip_id: trip.id, member_id: id })));
      }

      await syncRowToCalendars(
        familyId,
        "trips",
        trip.id,
        { title, startAt: new Date(`${startDate}T00:00:00`), endAt: endDate ? new Date(`${endDate}T00:00:00`) : null, allDay: true },
        travellerIds.length > 0 ? { kind: "members", memberIds: travellerIds } : { kind: "all" },
      );
      return done({ added: "trip", title, start_date: startDate, end_date: endDate, travellers: names });
    }

    case "record_money": {
      const accountName = str(input, "account_name");
      const direction = str(input, "direction");
      const amount = num(input, "amount");
      const particulars = str(input, "particulars");
      if (!accountName || !particulars) return fail("Need an account and what the money was for.");
      if (direction !== "in" && direction !== "out") return fail("Direction must be 'in' or 'out'.");
      if (!amount || amount <= 0) return fail("Amount must be greater than zero.");

      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, name, is_joint, owner_member_id")
        .eq("family_id", familyId)
        .eq("is_archived", false);
      const usable = (accounts ?? []).filter((a) => a.is_joint || a.owner_member_id === me.id);
      const wanted = accountName.toLowerCase();
      const account = usable.find((a) => a.name.toLowerCase() === wanted) ?? usable.find((a) => a.name.toLowerCase().includes(wanted));
      if (!account) {
        return fail(`No account called "${accountName}". Available: ${usable.map((a) => a.name).join(", ") || "none yet"}.`);
      }

      const occurredOn = str(input, "date");
      const { error } = await supabase.from("wealth_transactions").insert({
        family_id: familyId,
        account_id: account.id,
        direction,
        amount,
        particulars,
        category: str(input, "category"),
        occurred_at: occurredOn ? new Date(`${occurredOn}T12:00:00`).toISOString() : new Date().toISOString(),
        status: "confirmed",
        recorded_by: me.id,
      });
      if (error) return fail(error.message);

      return done({ recorded: direction === "in" ? "money in" : "money out", account: account.name, amount, particulars });
    }

    default:
      return fail(`Unknown tool "${name}".`);
  }
}
