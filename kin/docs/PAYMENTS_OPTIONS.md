# Paying for Kin with GCash, Maya or a card: the options

For Jonathan's decision (money and merchant accounts). Nothing here is built
yet; `src/lib/billing/` is where it would go, and that path is watched.

Kin costs **₱149 a month** or **₱1,490 a year** (`src/lib/billing/plans.ts`).
Fees below are the providers' published rates as found on 26 September 2026;
check them again on the sign-up pages, which are the only authority.

## Side by side

| | PayMongo | HitPay |
|---|---|---|
| Setup / monthly fee | none | none |
| GCash | 2.23% | 2.3% |
| Maya | 1.79% | (listed as supported; rate not published in what I found) |
| QR Ph | 1.34% | 1.0% or ₱20 |
| Local cards | 3.125% + ₱13.39 | 3% + ₱15 |
| Notes | rates shown exclude VAT | no extra fee on refunds; original fee not returned |
| Sign up | [paymongo.com](https://www.paymongo.com/en-ph/pricing) | [hitpayapp.com/ph](https://hitpayapp.com/ph/pricing) |

## What that means per payment

| | ₱149 monthly | ₱1,490 yearly |
|---|---|---|
| PayMongo, GCash | ₱3.32 | ₱33.23 |
| PayMongo, Maya | ₱2.67 | ₱26.67 |
| PayMongo, card | ₱18.05 (12%) | ₱59.95 |
| HitPay, GCash | ₱3.43 | ₱34.27 |
| HitPay, card | ₱19.47 (13%) | ₱59.70 |

(PayMongo's before VAT.)

## What I'd recommend

- **PayMongo**, with **GCash and Maya first**. It is the cheaper of the two for
  the wallets Filipino families actually use. It has also been around longest
  as a developer-first gateway here, which matters for a small team.
- **Push the yearly plan for cards.** A card's fixed ₱13–15 is 12–13% of a
  ₱149 month, but about 4% of a year.
- **Expect wallet renewals to be a reminder, not automatic.** GCash and Maya
  payments are usually one-off: each month the household gets a "renew" link.
  Automatic renewal is realistic on cards. Confirm what each provider offers
  for recurring wallet payments before building.

## What signing up involves (Jonathan)

- A business registration (DTI for a sole proprietorship, or SEC), a BIR
  certificate of registration, a valid ID and a bank account for payouts.
  The provider's own onboarding lists what it currently asks for.
- Once approved: a secret API key and a webhook secret, which go in Vercel as
  environment variables (Jonathan's). Building the checkout from there is
  ordinary work in `src/lib/billing/` and a webhook route.

Sources: [PayMongo pricing](https://www.paymongo.com/en-ph/pricing),
[HitPay pricing](https://hitpayapp.com/ph/pricing).
