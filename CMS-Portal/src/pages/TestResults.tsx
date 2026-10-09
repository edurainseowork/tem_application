import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'
import Modal from '../components/Modal'
import {
  ANSWER_COLORS, QUESTION_TYPE_LABELS, QuestionBody, SUBMISSION_REASON_LABELS, badgeStyle, formatDate, formatDateTime, formatMarks, formatTime, ghostButton,
  inputStyle, mutedText, tableStyle, tdStyle, thStyle,
  type QuestionType, type TestItem,
} from './testsShared'

type ResultRow = {
  id: number
  userId: number
  studentName: string | null
  studentEmail: string
  rank: number
  score: number
  correctCount: number
  wrongCount: number
  skippedCount: number
  totalQuestions: number
  startedAt: string
  endsAt: string
  submittedAt: string
  submissionReason: string | null
  violationCount: number
  reportedViolationCount: number | null
}

type Stats = {
  totalStudents: number
  totalSubmissions: number
  inProgress: number
  averageScore: number
  highestScore: number
  lowestScore: number
  averageCorrect: number
  averageWrong: number
  averageSkipped: number
  completionRate: number
  totalViolations: number
  maxScore: number
}

type ResultsResponse = {
  data: { stats: Stats; results: ResultRow[]; inProgress: ResultRow[] }
  pagination: { page: number; limit: number; total: number }
}

type ReviewItem = {
  questionId: number
  questionOrder: number
  type: QuestionType
  questionText: string
  passage: string | null
  options: any
  correctAnswer: string
  solution: string | null
  myAnswer: string | null
  status: 'CORRECT' | 'WRONG' | 'SKIPPED'
  marks: number
}

type ResultDetail = {
  test: TestItem
  student: { id: number; name: string | null; email: string }
  rank: number | null
  submission: ResultRow & { status: string; violations: { type: string; at: string }[] }
  review: ReviewItem[]
}

const PAGE_SIZE = 25
const studentLabel = (row: { studentName: string | null; studentEmail: string }) => row.studentName || row.studentEmail

function TestResults({ test, showToast }: { test: TestItem; showToast: (message: string, type?: 'success' | 'error') => void }) {
  const [response, setResponse] = useState<ResultsResponse | null>(null)
  const [state, setState] = useState({ loading: true, error: '' })
  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('')
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [sort, setSort] = useState<'score' | 'time'>('score')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort })
    if (search.trim()) params.set('search', search.trim())
    if (reason) params.set('reason', reason)
    if (minScore !== '') params.set('minScore', minScore)
    if (maxScore !== '') params.set('maxScore', maxScore)
    try {
      setResponse(await apiFetch<ResultsResponse>(`/cms/tests/${test.id}/results?${params}`))
      setState({ loading: false, error: '' })
    } catch (e: any) {
      setState({ loading: false, error: e.message })
    }
  }, [test.id, page, sort, search, reason, minScore, maxScore])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const forceSubmit = async (row: ResultRow) => {
    if (!window.confirm(`Close ${studentLabel(row)}'s attempt now? Unanswered questions count as skipped.`)) return
    try {
      await apiFetch(`/cms/tests/${test.id}/results/${row.id}/force-submit`, { method: 'POST' })
      showToast('Attempt submitted', 'success')
      load()
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    }
  }

  if (state.loading && !response) return <div className="glass-card"><p style={mutedText}>Loading results...</p></div>
  if (state.error && !response) return <div className="glass-card"><p style={{ color: '#ff8a8a' }}>Failed to load results: {state.error}</p></div>
  if (!response) return null

  const { stats, results, inProgress } = response.data
  const total = response.pagination.total
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const statCards: [string, string][] = [
    ['Total Students', String(stats.totalStudents)],
    ['Submissions', String(stats.totalSubmissions)],
    ['Completion', `${stats.completionRate}%`],
    ['Average Score', `${stats.averageScore} / ${stats.maxScore}`],
    ['Highest', String(stats.highestScore)],
    ['Lowest', String(stats.lowestScore)],
    ['Avg Correct', String(stats.averageCorrect)],
    ['Avg Wrong', String(stats.averageWrong)],
    ['Avg Skipped', String(stats.averageSkipped)],
    ['Violations', String(stats.totalViolations)],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-sm)' }}>
        {statCards.map(([label, value]) => (
          <div key={label} className="glass-card" style={{ padding: '12px 14px' }}>
            <div style={{ ...mutedText, fontSize: '0.75rem' }}>{label}</div>
            <div style={{ color: 'white', fontSize: '1.2rem', fontWeight: 700, marginTop: '4px' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3>Leaderboard</h3>
            <p style={{ ...mutedText, marginTop: '4px', fontSize: '0.78rem' }}>Click a student to see their answers question by question.</p>
            <p style={{ ...mutedText, marginTop: '4px' }}>Course: {test.courseTitle} · Test: {test.title}{test.targetBatch ? ` · Batch: ${test.targetBatch}` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search student / email / ID" style={{ ...inputStyle, width: '200px' }} />
            <select value={reason} onChange={(e) => { setReason(e.target.value); setPage(1) }} style={{ ...inputStyle, width: '190px' }}>
              <option value="">All submission reasons</option>
              {Object.entries(SUBMISSION_REASON_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <input type="number" value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(1) }} placeholder="Min score" style={{ ...inputStyle, width: '100px' }} />
            <input type="number" value={maxScore} onChange={(e) => { setMaxScore(e.target.value); setPage(1) }} placeholder="Max score" style={{ ...inputStyle, width: '100px' }} />
            <select value={sort} onChange={(e) => setSort(e.target.value as 'score' | 'time')} style={{ ...inputStyle, width: '170px' }}>
              <option value="score">Sort by score (rank)</option>
              <option value="time">Sort by submission time</option>
            </select>
          </div>
        </div>

        {results.length === 0 ? (
          <p style={mutedText}>{stats.totalSubmissions === 0 ? 'No submissions yet.' : 'No results match the filters.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {['Rank', 'Student', 'ID', 'Course / Test', 'Score', 'Correct', 'Wrong', 'Skipped', 'Submitted', 'Reason', 'Violations'].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.id} title="View result" style={{ cursor: 'pointer' }} onClick={() => setOpenId(row.id)}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{row.rank}</td>
                    <td style={tdStyle}>{studentLabel(row)}<div style={{ ...mutedText, fontSize: '0.75rem' }}>{row.studentEmail}</div></td>
                    <td style={tdStyle}>{row.userId}</td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem', minWidth: '150px' }}>{test.courseTitle}<div style={{ ...mutedText, fontSize: '0.75rem' }}>{test.title}</div></td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{row.score}</td>
                    <td style={{ ...tdStyle, color: '#6ee7b7' }}>{row.correctCount}</td>
                    <td style={{ ...tdStyle, color: '#ff8a8a' }}>{row.wrongCount}</td>
                    <td style={tdStyle}>{row.skippedCount}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(row.submittedAt)}<div style={mutedText}>{formatTime(row.submittedAt)}</div></td>
                    <td style={tdStyle}><ReasonBadge reason={row.submissionReason} /></td>
                    <td style={{ ...tdStyle, color: row.violationCount ? '#fbbf24' : undefined }}>
                      {row.violationCount}
                      {row.reportedViolationCount !== null && row.reportedViolationCount !== row.violationCount && (
                        <div style={{ ...mutedText, fontSize: '0.72rem' }}>app said {row.reportedViolationCount}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
            <span style={mutedText}>Page {page} of {totalPages} · {total} results</span>
            <button className="btn" style={ghostButton} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn" style={ghostButton} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>

      {inProgress.length > 0 && (
        <div className="glass-card">
          <h3 style={{ marginBottom: '8px' }}>Writing Now ({inProgress.length})</h3>
          <p style={{ ...mutedText, marginBottom: 'var(--space-md)' }}>Attempts that are still open. They close automatically when the time runs out; use Submit Now only if a student is stuck.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {inProgress.map((row) => (
              <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
                <span>{studentLabel(row)} <span style={mutedText}>· started {formatDateTime(row.startedAt)} · ends {formatDateTime(row.endsAt)} · violations {row.violationCount}</span></span>
                <button className="btn" style={ghostButton} onClick={() => forceSubmit(row)}>Submit Now</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {openId !== null && <ResultDetailModal testId={test.id} submissionId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function ReasonBadge({ reason }: { reason: string | null }) {
  const cheating = reason?.startsWith('CHEATING')
  return (
    <span
      style={{
        ...badgeStyle,
        background: cheating ? 'rgba(239, 68, 68, 0.2)' : reason === 'MANUAL_SUBMIT' ? 'rgba(29,154,120,0.7)' : 'rgba(255,255,255,0.15)',
        border: cheating ? '1px solid #ef4444' : 'none',
        color: cheating ? '#fca5a5' : 'white',
        fontWeight: cheating ? 700 : 600,
        padding: '4px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {cheating ? `🚨 ${SUBMISSION_REASON_LABELS[reason] ?? reason}` : (reason ? SUBMISSION_REASON_LABELS[reason] ?? reason : '—')}
    </span>
  )
}

// Student result: summary and every question with the student's answer vs the correct answer
function ResultDetailModal({ testId, submissionId, onClose }: { testId: number; submissionId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<ResultDetail | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'' | 'CORRECT' | 'WRONG' | 'SKIPPED'>('')

  useEffect(() => {
    apiFetch<{ data: ResultDetail }>(`/cms/tests/${testId}/results/${submissionId}`)
      .then((data) => setDetail(data.data))
      .catch((e) => setError(e.message))
  }, [testId, submissionId])

  const s = detail?.submission
  const info: [string, string][] = detail && s ? [
    ['Student Name', detail.student.name || '—'],
    ['Student ID', String(detail.student.id)],
    ['Email', detail.student.email],
    ['Course', detail.test.courseTitle],
    ['Test', detail.test.title],
    ['Batch', detail.test.targetBatch || '—'],
    ['Rank', detail.rank ? String(detail.rank) : '—'],
    ['Score', String(s.score)],
    ['Correct / Wrong / Skipped', `${s.correctCount} / ${s.wrongCount} / ${s.skippedCount}`],
    ['Started At', formatDateTime(s.startedAt)],
    ['Submitted At', formatDateTime(s.submittedAt)],
    ['Submission Reason', s.submissionReason ? SUBMISSION_REASON_LABELS[s.submissionReason] ?? s.submissionReason : '—'],
    ['Violations (server)', String(s.violationCount)],
    ['Violations (app reported)', s.reportedViolationCount === null ? '—' : String(s.reportedViolationCount)],
  ] : []

  const review = (detail?.review ?? []).filter((item) => !filter || item.status === filter)

  return (
    <Modal title="Student Result" subtitle={detail ? `${detail.test.courseTitle} · ${detail.test.title}` : undefined} onClose={onClose} width={860}>
      {error ? (
        <p style={{ color: '#ff8a8a' }}>Failed to load result: {error}</p>
      ) : !detail || !s ? (
        <p style={mutedText}>Loading result...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
            {info.map(([label, value]) => (
              <div key={label} style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ ...mutedText, fontSize: '0.72rem' }}>{label}</div>
                <div style={{ color: 'white', fontSize: '0.88rem', marginTop: '2px', wordBreak: 'break-word' }}>{value}</div>
              </div>
            ))}
          </div>
          {s.violations?.length > 0 && (
            <p style={{ ...mutedText, color: '#fbbf24' }}>
              Violation events: {s.violations.map((v) => `${v.type} at ${new Date(v.at).toLocaleTimeString()}`).join(', ')}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h4 style={{ color: 'white' }}>Question-by-Question Review</h4>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['', 'CORRECT', 'WRONG', 'SKIPPED'] as const).map((key) => (
                <button key={key || 'all'} className="btn" style={filter === key ? { padding: '6px 12px', fontSize: '0.8rem' } : ghostButton} onClick={() => setFilter(key)}>{key || 'All'}</button>
              ))}
            </div>
          </div>

          {review.length === 0 ? (
            <p style={mutedText}>No questions in this view.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {review.map((item) => (
                <div key={item.questionId} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', borderLeft: `4px solid ${ANSWER_COLORS[item.status]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <strong>Question {item.questionOrder}</strong>
                      <span style={{ ...badgeStyle, background: 'rgba(79,70,229,0.6)' }}>{QUESTION_TYPE_LABELS[item.type] ?? item.type}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ ...badgeStyle, background: ANSWER_COLORS[item.status] }}>{item.status}</span>
                      <strong>{formatMarks(item.marks)}</strong>
                    </div>
                  </div>
                  <QuestionBody question={{ ...item, marksPositive: null, marksNegative: null, solution: item.solution }} showAnswer={false} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '10px', fontSize: '0.85rem' }}>
                    <div><span style={mutedText}>Student Answer: </span><strong style={{ color: item.status === 'WRONG' ? '#ff8a8a' : 'white' }}>{item.myAnswer ?? 'Not Answered'}</strong></div>
                    <div><span style={mutedText}>Correct Answer: </span><strong style={{ color: '#6ee7b7' }}>{item.correctAnswer.split('|').join(' or ')}</strong></div>
                  </div>
                  {item.solution && <p style={{ ...mutedText, marginTop: '6px', fontSize: '0.8rem' }}>Solution: {item.solution}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

export default TestResults
