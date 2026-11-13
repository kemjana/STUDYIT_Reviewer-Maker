// Shared types. Everything the app stores or sends is described here.
// Phases 2-4 (accounts, Leitner boxes, chat) will extend these types, not replace them.

export type Section = {
  id: string; // "s1", "s2", ...  (what Gemini cites)
  label: string; // "Page 12" or "Section 3: Networking basics" (what the student sees)
  text: string;
};

export type Chapter = { id: string; title: string; from: number; to: number }; // indexes into sections

export type SourceRef = {
  sourceId: string; // must match a Section id
  evidence: string; // short quote copied from that section (checked by the server)
};

export type Topic = SourceRef & { id: string; title: string; summary: string; keyPoints: string[] };
export type Term = SourceRef & { id: string; term: string; definition: string };
export type Reviewer = { topics: Topic[]; terms: Term[] };

export type Flashcard = SourceRef & { id: string; front: string; back: string; topic: string };

export const QUESTION_TYPES = ["multiple_choice", "true_false", "identification", "fill_blank"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  identification: "Identification",
  fill_blank: "Fill in the blank",
};

export type Question = SourceRef & {
  id: string;
  type: QuestionType;
  question: string;
  choices?: string[]; // multiple_choice only
  answer: string;
  alternates?: string[]; // other accepted typed answers that appear in the material (identification / fill_blank)
  explanation: string;
  topic: string;
};

export type AttemptAnswer = { questionId: string; given: string; correct: boolean; topic?: string };

export type Attempt = {
  id: string; // created when the quiz starts; saving twice never double counts
  at: string;
  mode?: "practice" | "exam"; // older attempts have no mode (they were practice)
  total: number;
  correct: number;
  seconds?: number; // exam: time used
  limitSeconds?: number; // exam: time allowed
  answers: AttemptAnswer[];
};

export type StudySet = {
  id: string;
  title: string;
  createdAt: string;
  sourceType: "text" | "pdf" | "txt";
  fileName?: string;
  sections: Section[];
  reviewer: Reviewer;
  flashcards: Flashcard[];
  questions: Question[];
  attempts: Attempt[];
  reported: string[]; // ids of questions/cards the student reported
  cardProgress: Record<string, "known" | "again">;
  simplified: Record<string, string>; // itemId -> "explain simpler" text (saved so it is not asked twice)
  updatedAt?: string;
};

/** What the sidebar, the dashboard, and the progress page need to know about a saved module (no long text). */
export type SetSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  cards: number;
  questions: number;
  pages: number;
  attempts: Attempt[];
};

export type SaveResult = { ok: true } | { ok: false; message: string };

export type GenerateKind = "reviewer" | "flashcards" | "quiz";

export type GenerateRequest = {
  kind: GenerateKind;
  sections: Section[];
  count?: number; // flashcards / quiz
  types?: QuestionType[]; // quiz
  avoid?: string[]; // existing fronts/questions so we do not repeat them
  focusTopics?: string[]; // Phase 3: weak topics
};

export type ExplainRequest = { text: string; section: Section };

export type ApiError = { code: string; message: string; retryable: boolean; detail?: string };

export type GenerateResponse =
  | {
      ok: true;
      kind: GenerateKind;
      reviewer?: { topics: Omit<Topic, "id">[]; terms: Omit<Term, "id">[] };
      flashcards?: Omit<Flashcard, "id">[];
      questions?: Omit<Question, "id">[];
      dropped: number; // items removed because they were not backed by the text
    }
  | { ok: false; error: ApiError };

export type ExplainResponse = { ok: true; simple: string; sourceId: string; evidence: string } | { ok: false; error: ApiError };
