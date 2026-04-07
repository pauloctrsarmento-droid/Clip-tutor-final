/** Mastery algorithm constants (ported from clip-tutor/server/mastery.js) */
export const MASTERY = {
  /** Score added on correct answer */
  CORRECT_BOOST: 0.35,
  /** Score subtracted on wrong answer */
  INCORRECT_PENALTY: 0.2,
  /** Score at which a fact is considered "mastered" */
  MASTERED_THRESHOLD: 0.8,
  /** Days without review before decay kicks in */
  DECAY_DAYS: 14,
  /** Score subtracted by decay */
  DECAY_AMOUNT: 0.1,
} as const;

/** Single-user student ID (Luísa) */
export const STUDENT_ID = "00000000-0000-0000-0000-000000000001";

/** Default flashcard deck size */
export const FLASHCARD_DEFAULT_LIMIT = 20;

/** Default quiz question count */
export const QUIZ_DEFAULT_COUNT = 10;

/** Days without review before a topic is flagged "stale" in suggestions */
export const STALE_DAYS = 7;

/** Topic avg mastery below this is flagged for revision */
export const WEAK_TOPIC_THRESHOLD = 0.6;

/** Max suggestions generated per refresh */
export const MAX_SUGGESTIONS = 5;

/** OpenAI model for AI features (reschedule, quiz eval, chat tutor) */
export const OPENAI_MODEL = "gpt-4o";

/** The 6 subjects Luísa actually studies (excludes English Lit 0475, English Lang 0500) */
export const STUDY_SUBJECTS: string[] = ["0620", "0625", "0610", "0478", "0520", "0504"];

/** Subjects with no exam questions — quiz disabled, only flashcards + past papers */
export const QUIZ_DISABLED_SUBJECTS = new Set(["0520", "0504", "0500", "0475"]);

/** Subject language mapping for prompt localisation */
export const SUBJECT_LANGUAGE: Record<string, string> = {
  "0620": "English",
  "0625": "English",
  "0610": "English",
  "0478": "English",
  "0500": "English",
  "0520": "French",
  "0504": "Portuguese",
};

/** Subject language code mapping */
export const SUBJECT_LANG_CODE: Record<string, string> = {
  "0620": "en",
  "0625": "en",
  "0610": "en",
  "0478": "en",
  "0500": "en",
  "0520": "fr",
  "0504": "pt",
};
