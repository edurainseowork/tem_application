import type { QuestionType, StudentAnswerValue } from "@workspace/api-zod";

// Marking rules for tests. Everything here runs on the server; the app never sends scores.

export type OptionItem = { key: string; text: string };
export type MatchOptions = { left: OptionItem[]; right: OptionItem[] };

// A question as stored in test_questions (minus ids and timestamps)
export type QuestionValues = {
  type: QuestionType;
  questionText: string;
  passage: string | null;
  options: OptionItem[] | MatchOptions | null;
  correctAnswer: string;
  solution: string | null;
  marksPositive: number | null;
  marksNegative: number | null;
  questionOrder: number;
};

// Same fields as a CSV row or the CMS question form
export type RawQuestion = {
  questionOrder: number;
  type: QuestionType;
  questionText: string;
  passage?: string | null;
  options?: string[];
  matchOptions?: string[];
  correctAnswer: string;
  solution?: string | null;
  marksPositive?: number | null;
  marksNegative?: number | null;
};

const OPTION_KEYS = ["A", "B", "C", "D"];
const INTEGER_PATTERN = /^[+-]?\d+$/;

// ---- Normalizers (deliberately conservative) ----

// "a, c" → ["A","C"]; returns null when it is not a list of letters
const parseLetters = (value: string): string[] | null => {
  const parts = value.split(/[\s,]+/).filter(Boolean).map((part) => part.toUpperCase());
  if (parts.length === 0 || parts.some((part) => !/^[A-Z]$/.test(part))) return null;
  return [...new Set(parts)].sort();
};

// " 05 " → "5", "-0" → "0"; null when it is not a whole number
const parseInteger = (value: string): string | null => {
  const trimmed = value.trim();
  if (!INTEGER_PATTERN.test(trimmed)) return null;
  const normalized = BigInt(trimmed).toString();
  return normalized === "-0" ? "0" : normalized;
};

// Trim, collapse inner whitespace, ignore case. Punctuation is kept on purpose.
const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const parseBoolean = (value: string): "TRUE" | "FALSE" | null => {
  const v = value.trim().toUpperCase();
  if (["TRUE", "T", "1", "YES"].includes(v)) return "TRUE";
  if (["FALSE", "F", "0", "NO"].includes(v)) return "FALSE";
  return null;
};

// "A-2, b-1" → { A: "2", B: "1" }; null when malformed or a left item appears twice
const parsePairs = (value: string): Record<string, string> | null => {
  const pairs: Record<string, string> = {};
  for (const part of value.split(",").map((p) => p.trim()).filter(Boolean)) {
    const match = /^([A-Za-z])\s*[-:=]\s*(\d+)$/.exec(part);
    if (!match) return null;
    const left = match[1].toUpperCase();
    if (pairs[left] !== undefined) return null;
    pairs[left] = String(Number(match[2]));
  }
  return Object.keys(pairs).length ? pairs : null;
};

const formatPairs = (pairs: Record<string, string>) =>
  Object.keys(pairs).sort().map((left) => `${left}-${pairs[left]}`).join(",");

const hasChoices = (question: { type: QuestionType; options: unknown }) =>
  question.type === "multiple_choice" || (question.type === "comprehension" && Array.isArray(question.options) && question.options.length > 0);

// ---- Building a question from a CSV row or the CMS form ----

// Returns the cleaned question, or the list of problems (shown to the admin)
export function buildQuestion(raw: RawQuestion): { ok: true; value: QuestionValues } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const optionTexts = (raw.options ?? []).map((text) => text.trim());
  const choiceOptions: OptionItem[] = optionTexts
    .map((text, index) => ({ key: OPTION_KEYS[index], text }))
    .filter((option) => option.text);
  const answer = raw.correctAnswer.trim();

  let options: QuestionValues["options"] = null;
  let correctAnswer = answer;

  const checkChoiceAnswer = () => {
    if (choiceOptions.length < 2) errors.push("Options A and B are required");
    const letters = parseLetters(answer);
    if (!letters) {
      errors.push("Correct answer must be option letters such as B or A,C");
    } else if (letters.some((letter) => !choiceOptions.some((option) => option.key === letter))) {
      errors.push("Correct answer does not exist in options");
    } else {
      correctAnswer = letters.join(",");
    }
    options = choiceOptions;
  };

  const checkTextAnswer = () => {
    const accepted = answer.split("|").map((part) => part.trim()).filter(Boolean);
    if (accepted.length === 0) errors.push("Correct answer is required");
    correctAnswer = accepted.join("|");
  };

  switch (raw.type) {
    case "multiple_choice":
      checkChoiceAnswer();
      break;
    case "integer": {
      const value = parseInteger(answer);
      if (value === null) errors.push("Correct answer must be a whole number for integer questions");
      else correctAnswer = value;
      break;
    }
    case "fill_ups":
      checkTextAnswer();
      break;
    case "true_false": {
      const value = parseBoolean(answer);
      if (!value) errors.push("Correct answer must be TRUE or FALSE");
      else correctAnswer = value;
      break;
    }
    case "comprehension":
      if (!raw.passage?.trim()) errors.push("Passage is required for comprehension questions");
      // With options it is marked like multiple choice, otherwise like a fill-up
      if (choiceOptions.length > 0) checkChoiceAnswer();
      else checkTextAnswer();
      break;
    case "match_the_following": {
      const left = choiceOptions;
      const right = (raw.matchOptions ?? []).map((text) => text.trim()).filter(Boolean).map((text, index) => ({ key: String(index + 1), text }));
      if (left.length < 2) errors.push("At least two left-side items (option_a, option_b) are required");
      if (right.length < 2) errors.push("match_options must list at least two right-side items separated by |");
      const pairs = parsePairs(answer);
      if (!pairs) {
        errors.push("Correct answer must look like A-2,B-1,C-4,D-3");
      } else {
        const leftKeys = left.map((item) => item.key);
        if (Object.keys(pairs).some((key) => !leftKeys.includes(key)) || Object.values(pairs).some((value) => !right.some((item) => item.key === value))) {
          errors.push("Correct answer does not exist in options");
        } else if (leftKeys.some((key) => pairs[key] === undefined)) {
          errors.push("Correct answer must give a match for every left-side item");
        } else {
          correctAnswer = formatPairs(pairs);
        }
      }
      options = { left, right };
      break;
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      type: raw.type,
      questionText: raw.questionText.trim(),
      passage: raw.type === "comprehension" ? raw.passage!.trim() : null,
      options,
      correctAnswer,
      solution: raw.solution?.trim() || null,
      marksPositive: raw.marksPositive ?? null,
      marksNegative: raw.marksNegative ?? null,
      questionOrder: raw.questionOrder,
    },
  };
}

// ---- Student answers ----

type GradableQuestion = Pick<QuestionValues, "type" | "options" | "correctAnswer" | "marksPositive" | "marksNegative">;

// Converts whatever the app sent into the canonical form for this question type.
// Returns { blank: true } for "not answered" and { error } for answers in the wrong format.
export function normalizeStudentAnswer(
  question: GradableQuestion,
  value: StudentAnswerValue | undefined,
): { blank: true } | { blank: false; value: string } | { error: string } {
  if (value === null || value === undefined) return { blank: true };

  let text: string;
  if (Array.isArray(value)) text = value.join(",");
  else if (typeof value === "object") text = Object.entries(value).map(([left, right]) => `${left}-${right}`).join(",");
  else text = String(value);
  if (text.trim() === "") return { blank: true };

  if (hasChoices(question)) {
    const letters = parseLetters(text);
    const keys = (question.options as OptionItem[]).map((option) => option.key);
    if (!letters || letters.some((letter) => !keys.includes(letter))) return { error: "Answer must be one of the option letters" };
    return { blank: false, value: letters.join(",") };
  }
  switch (question.type) {
    case "integer": {
      const parsed = parseInteger(text);
      return parsed === null ? { error: "Answer must be a whole number" } : { blank: false, value: parsed };
    }
    case "true_false": {
      const parsed = parseBoolean(text);
      return parsed ? { blank: false, value: parsed } : { error: "Answer must be TRUE or FALSE" };
    }
    case "match_the_following": {
      const pairs = parsePairs(text);
      const { left, right } = question.options as MatchOptions;
      if (!pairs || Object.keys(pairs).some((key) => !left.some((item) => item.key === key)) || Object.values(pairs).some((v) => !right.some((item) => item.key === v))) {
        return { error: "Answer must pair items like A-2,B-1" };
      }
      return { blank: false, value: formatPairs(pairs) };
    }
    default: // fill_ups and comprehension without options
      return text.length > 500 ? { error: "Answer is too long" } : { blank: false, value: text.trim().replace(/\s+/g, " ") };
  }
}

export type AnswerStatus = "CORRECT" | "WRONG" | "SKIPPED";

// Marks one normalized answer. Partially correct match-the-following answers are wrong (all pairs must match).
export function gradeAnswer(
  question: GradableQuestion,
  normalized: string | null,
  defaults: { marksPositive: number; marksNegative: number },
): { status: AnswerStatus; marks: number } {
  if (normalized === null) return { status: "SKIPPED", marks: 0 };
  const isTextAnswer = question.type === "fill_ups" || (question.type === "comprehension" && !hasChoices(question));
  const correct = isTextAnswer
    ? question.correctAnswer.split("|").some((accepted) => normalizeText(accepted) === normalizeText(normalized))
    : normalized === question.correctAnswer;
  return correct
    ? { status: "CORRECT", marks: question.marksPositive ?? defaults.marksPositive }
    : { status: "WRONG", marks: -(question.marksNegative ?? defaults.marksNegative) };
}

export const roundMarks = (value: number) => Math.round(value * 100) / 100;
