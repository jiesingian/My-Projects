/** One question a week for the journal, the kind a grandchild asks a
 * grandparent: answered in a line or a paragraph, it becomes an ordinary
 * journal entry titled with the question. The same question for the whole
 * household that week, so answers from different people sit side by side.
 * Rotates by ISO week; nothing is stored for it. */
export const STORY_PROMPTS = [
  "What was your first job, and what did it pay?",
  "Where did you live when you were ten?",
  "How did you meet your spouse?",
  "What did Noche Buena look like when you were a child?",
  "What is a dish only our family makes?",
  "What was the hardest year you remember, and how did you get through it?",
  "Who was your favourite teacher, and why?",
  "What did you do on weekends as a teenager?",
  "What advice would you give your younger self?",
  "What is the funniest thing that happened at a family reunion?",
  "What did your parents do for a living?",
  "Which song takes you straight back to your youth?",
  "What were you most proud of this year?",
  "What is a tradition you hope our family keeps?",
  "Where is a place you would love to take the whole family?",
  "What did your first home look like?",
  "What was school like for you?",
  "Tell the story of how you got your name.",
  "What is one thing you wish you had asked your grandparents?",
  "What made you laugh this week?",
] as const;

export function promptForWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return STORY_PROMPTS[(d.getUTCFullYear() * 53 + week) % STORY_PROMPTS.length];
}
