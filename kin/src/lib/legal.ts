/** Who runs Kin, for the privacy notice, terms and refund policy
 * (src/app/legal/). These are Jonathan's to fill in once the business is
 * registered (DTI or SEC, and the BIR): the Internet Transactions Act asks
 * an online seller to show its name, address, contact and registration
 * numbers, and the Data Privacy Act asks for a way to reach the Data
 * Protection Officer. Until a field is set the pages say it is being
 * registered, rather than print a placeholder. */
export const OPERATOR: {
  /** The registered business name, e.g. from the DTI certificate. */
  name: string | null;
  address: string | null;
  /** A support address people can write to about their data or a payment. */
  email: string | null;
  /** The Data Protection Officer's name; the email above reaches them. */
  dpo: string | null;
  /** DTI or SEC registration number, and the BIR TIN. */
  registration: string | null;
  tin: string | null;
} = {
  name: null,
  address: null,
  email: null,
  dpo: null,
  registration: null,
  tin: null,
};

/** The date the current wording took effect. Change it whenever the words do. */
export const LEGAL_UPDATED = "28 September 2026";
