import { MAX_QUESTIONS_PER_TEST, QUESTION_TYPES, type QuestionType } from "@workspace/api-zod";
import { buildQuestion, type QuestionValues } from "./testEvaluation";

// Question upload: the CSV template, a small RFC 4180 reader and row-by-row validation.

export const QUESTION_CSV_COLUMNS = [
  "question_order",
  "question_type",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "marks_positive",
  "marks_negative",
  "solution",
  "passage_group",
  "passage",
  "match_options",
] as const;

const REQUIRED_COLUMNS = ["question_order", "question_type", "question_text", "correct_answer"];

const TEMPLATE_ROWS = [
  ["1", "multiple_choice", "What is 2 + 2?", "3", "4", "5", "6", "B", "4", "1", "2 + 2 = 4", "", "", ""],
  ["2", "multiple_choice", "Which of these are prime numbers? (select all that apply)", "2", "4", "5", "9", "A,C", "4", "2", "2 and 5 have no divisors other than 1 and themselves", "", "", ""],
  ["3", "integer", "What is 10 / 2?", "", "", "", "", "5", "4", "1", "", "", "", ""],
  ["4", "fill_ups", "The capital of India is ____.", "", "", "", "", "New Delhi|Delhi", "4", "0", "", "", "", ""],
  ["5", "true_false", "Java code is compiled to bytecode.", "", "", "", "", "TRUE", "", "", "Leave marks blank to use the test's default marks", "", "", ""],
  ["6", "match_the_following", "Match each animal with its sound.", "Dog", "Cat", "Cow", "Duck", "A-2,B-1,C-4,D-3", "4", "1", "", "", "", "Meow|Bark|Quack|Moo"],
  ["7", "comprehension", "According to the passage, what happens to water at 100°C at sea level?", "It freezes", "It boils", "It melts", "Nothing", "B", "4", "1", "", "P1", "Water boils at 100°C at sea level and freezes at 0°C. Salt raises the boiling point slightly.", ""],
  ["8", "comprehension", "At what temperature (in °C) does water freeze?", "", "", "", "", "0", "4", "1", "", "P1", "", ""],
];

const escapeCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

// UTF-8 BOM so Excel shows symbols such as ° correctly
export const questionTemplateCsv = () =>
  "﻿" + [QUESTION_CSV_COLUMNS as readonly string[], ...TEMPLATE_ROWS].map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";

// RFC 4180: quoted cells, "" escapes, commas and line breaks inside quotes, CRLF or LF
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (inQuotes) throw new Error("The file has an unclosed quote (\")");
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export type RowError = { row: number; message: string };
export type ParsedUpload = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: RowError[];
  questions: QuestionValues[];
};

const parseOptionalMarks = (value: string): number | null | undefined => {
  if (value.trim() === "") return null;
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
};

// Checks every row; the caller saves only when errors is empty. Row numbers match the spreadsheet (header = row 1).
export function parseQuestionCsv(text: string, existingOrders: number[] = []): ParsedUpload {
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (err) {
    return { totalRows: 0, validRows: 0, invalidRows: 0, errors: [{ row: 0, message: (err as Error).message }], questions: [] };
  }
  const fail = (message: string): ParsedUpload => ({ totalRows: 0, validRows: 0, invalidRows: 0, errors: [{ row: 1, message }], questions: [] });
  if (table.length === 0) return fail("The file is empty");

  const header = table[0].map((name) => name.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) return fail(`Missing column(s): ${missing.join(", ")}. Download the template for the correct format.`);
  const col = (cells: string[], name: string) => {
    const index = header.indexOf(name);
    return index === -1 ? "" : (cells[index] ?? "").trim();
  };

  const body = table
    .slice(1)
    .map((cells, index) => ({ cells, row: index + 2 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ""));
  if (body.length === 0) return fail("The file has no questions");
  if (body.length > MAX_QUESTIONS_PER_TEST) return fail(`A file can have at most ${MAX_QUESTIONS_PER_TEST} questions`);

  const errors: RowError[] = [];
  const questions: QuestionValues[] = [];
  const seenOrders = new Map<number, number>();
  const passages = new Map<string, string>();
  let invalidRows = 0;

  for (const { cells, row } of body) {
    const rowErrors: string[] = [];
    const type = col(cells, "question_type").toLowerCase().replace(/[\s-]+/g, "_") as QuestionType;
    const orderText = col(cells, "question_order");
    const order = Number(orderText);

    if (!(QUESTION_TYPES as readonly string[]).includes(type)) rowErrors.push(`Invalid question type "${col(cells, "question_type")}"`);
    if (!/^\d+$/.test(orderText) || order < 1) {
      rowErrors.push("Question order must be a whole number of 1 or more");
    } else if (seenOrders.has(order)) {
      rowErrors.push(`Question order ${order} is also used on row ${seenOrders.get(order)}`);
    } else if (existingOrders.includes(order)) {
      rowErrors.push(`Question order ${order} already exists in this test`);
    } else {
      seenOrders.set(order, row);
    }
    if (!col(cells, "question_text")) rowErrors.push("Question text is missing");
    if (!col(cells, "correct_answer")) rowErrors.push("Correct answer is missing");

    const marksPositive = parseOptionalMarks(col(cells, "marks_positive"));
    const marksNegative = parseOptionalMarks(col(cells, "marks_negative"));
    if (marksPositive === undefined) rowErrors.push("Positive marks is invalid (use a number from 0 to 100, or leave blank)");
    if (marksNegative === undefined) rowErrors.push("Negative marks is invalid (use a number from 0 to 100, or leave blank)");

    // Comprehension rows in the same passage_group share the passage written on the group's first row
    let passage = col(cells, "passage");
    const group = col(cells, "passage_group");
    if (type === "comprehension" && group) {
      if (passage) passages.set(group, passage);
      else passage = passages.get(group) ?? "";
    }

    if (rowErrors.length === 0) {
      const built = buildQuestion({
        questionOrder: order,
        type,
        questionText: col(cells, "question_text"),
        passage,
        options: ["option_a", "option_b", "option_c", "option_d"].map((name) => col(cells, name)),
        matchOptions: col(cells, "match_options").split("|"),
        correctAnswer: col(cells, "correct_answer"),
        solution: col(cells, "solution"),
        marksPositive: marksPositive ?? null,
        marksNegative: marksNegative ?? null,
      });
      if (built.ok) questions.push(built.value);
      else rowErrors.push(...built.errors);
    }

    if (rowErrors.length) {
      invalidRows++;
      for (const message of rowErrors) errors.push({ row, message });
    }
  }

  questions.sort((a, b) => a.questionOrder - b.questionOrder);
  return { totalRows: body.length, validRows: questions.length, invalidRows, errors, questions };
}
