import type { CSSProperties } from 'react'
import { auth } from '../firebase'
import { API_BASE_URL } from '../api'

// Types, styles and helpers shared by the Tests screens (sidebar → Tests)

export type TestStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'COMPLETED' | 'ARCHIVED'

export type TestItem = {
  id: number
  courseId: number
  courseTitle: string
  title: string
  description: string | null
  targetBatch: string | null
  storedStatus: 'DRAFT' | 'SCHEDULED' | 'ARCHIVED'
  status: TestStatus
  publishTime: string
  closeTime: string | null
  durationMinutes: number
  marksPositive: number
  marksNegative: number
  createdBy: string | null
  createdAt: string
  questionCount: number
  submissionCount: number
}

export type TestCourse = { id: number; title: string; category: string; thumbnail: string; isPublished: boolean; testCount: number }

export type OptionItem = { key: string; text: string }
export type MatchOptions = { left: OptionItem[]; right: OptionItem[] }

export type Question = {
  id: number
  testId: number
  type: QuestionType
  questionText: string
  passage: string | null
  options: OptionItem[] | MatchOptions | null
  correctAnswer: string
  solution: string | null
  marksPositive: number | null
  marksNegative: number | null
  questionOrder: number
}

export type ParsedQuestion = Omit<Question, 'id' | 'testId'>

export type UploadResult = {
  totalRows: number
  validRows: number
  invalidRows: number
  errors: { row: number; message: string }[]
  questions: ParsedQuestion[]
}

export const QUESTION_TYPES = ['multiple_choice', 'integer', 'fill_ups', 'true_false', 'comprehension', 'match_the_following'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  integer: 'Integer',
  fill_ups: 'Fill Ups',
  true_false: 'True/False',
  comprehension: 'Comprehension',
  match_the_following: 'Match the Following',
}

export const SUBMISSION_REASON_LABELS: Record<string, string> = {
  MANUAL_SUBMIT: 'Submitted',
  TIME_EXPIRED: 'Time expired',
  CHEATING_APP_MINIMIZED: 'Cheating - App Minimized',
  CHEATING_SCREEN_EXIT: 'Cheating - Screen Exit',
  ADMIN_SUBMISSION: 'Closed by admin',
}

export const inputStyle: CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', colorScheme: 'dark' }
export const labelStyle: CSSProperties = { display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }
export const ghostButton: CSSProperties = { background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', fontSize: '0.8rem' }
export const dangerButton: CSSProperties = { background: '#ff5e5e', border: 'none', padding: '6px 12px', fontSize: '0.8rem' }
export const badgeStyle: CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', color: 'white', whiteSpace: 'nowrap', display: 'inline-block' }
export const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }
export const thStyle: CSSProperties = { textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }
export const tdStyle: CSSProperties = { padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'white', verticalAlign: 'top' }
export const mutedText: CSSProperties = { color: 'var(--text-secondary)', fontSize: '0.85rem' }

const STATUS_COLORS: Record<TestStatus, string> = {
  DRAFT: 'rgba(255,255,255,0.15)',
  SCHEDULED: 'rgba(79,70,229,0.7)',
  PUBLISHED: 'rgba(29,154,120,0.8)',
  COMPLETED: 'rgba(100,116,139,0.8)',
  ARCHIVED: 'rgba(100,116,139,0.5)',
}

export function StatusBadge({ status }: { status: TestStatus }) {
  return <span style={{ ...badgeStyle, background: STATUS_COLORS[status] }}>{status}</span>
}

export const ANSWER_COLORS = { CORRECT: 'rgba(29,154,120,0.8)', WRONG: '#ff5e5e', SKIPPED: 'rgba(255,255,255,0.15)' } as const

export const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
export const formatTime = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
export const formatDateTime = (value: string | null) => (value ? `${formatDate(value)}, ${formatTime(value)}` : '—')
export const formatMarks = (value: number) => (value > 0 ? `+${value}` : String(value))

// "2026-10-12" + "12:00" in the admin's local time → ISO string for the API
export const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString()

// ISO → local "YYYY-MM-DD" and "HH:mm" for date/time inputs
export const toLocalParts = (iso: string | null) => {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

// Choice options as a list (multiple choice, comprehension) — empty for other types
export const choiceOptions = (options: Question['options']): OptionItem[] => (Array.isArray(options) ? options : [])
export const matchOptions = (options: Question['options']): MatchOptions | null =>
  options && !Array.isArray(options) && 'left' in options ? options : null

// The template needs the admin's token, so it is fetched and saved as a file
export async function downloadQuestionTemplate() {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(`${API_BASE_URL}/api/cms/tests/template`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = 'test-questions-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

// Upload endpoints answer 400 with the row errors in `data`; apiFetch only keeps the message, so these use fetch directly
export async function postCsv(path: string, formData: FormData): Promise<{ ok: boolean; message: string; data: UploadResult | null; payload: any }> {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(`${API_BASE_URL}/api${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData })
  const payload = await res.json().catch(() => ({}))
  const data = payload?.data && 'errors' in payload.data ? (payload.data as UploadResult) : null
  return { ok: res.ok, message: payload.message || payload.error || `Request failed (${res.status})`, data, payload }
}

// Shows how a question's options and answer look, for previews and the question list
export function QuestionBody({ question, showAnswer = true }: { question: ParsedQuestion; showAnswer?: boolean }) {
  const choices = choiceOptions(question.options)
  const match = matchOptions(question.options)
  const correct = new Set(question.correctAnswer.split(','))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {question.passage && (
        <div style={{ ...mutedText, padding: '8px 10px', borderLeft: '3px solid rgba(255,94,94,0.6)', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>{question.passage}</div>
      )}
      <div style={{ color: 'white', whiteSpace: 'pre-wrap' }}>{question.questionText}</div>
      {choices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px' }}>
          {choices.map((option) => {
            const isCorrect = showAnswer && correct.has(option.key)
            return (
              <div key={option.key} style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', background: isCorrect ? 'rgba(29,154,120,0.25)' : 'rgba(0,0,0,0.2)', border: `1px solid ${isCorrect ? 'rgba(29,154,120,0.8)' : 'rgba(255,255,255,0.08)'}` }}>
                <strong>{option.key}.</strong> {option.text}
              </div>
            )
          })}
        </div>
      )}
      {match && (
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <div>{match.left.map((item) => <div key={item.key}><strong>{item.key}.</strong> {item.text}</div>)}</div>
          <div>{match.right.map((item) => <div key={item.key}><strong>{item.key}.</strong> {item.text}</div>)}</div>
        </div>
      )}
      {showAnswer && (
        <div style={{ fontSize: '0.85rem' }}>
          <span style={mutedText}>Correct answer: </span>
          <strong style={{ color: '#6ee7b7' }}>{question.correctAnswer.split('|').join('  or  ')}</strong>
          {question.solution && <div style={{ ...mutedText, marginTop: '4px' }}>Solution: {question.solution}</div>}
        </div>
      )}
    </div>
  )
}
