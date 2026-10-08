import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import Modal from '../components/Modal'
import TestFormModal, { UploadSummary } from './TestFormModal'
import TestResults from './TestResults'
import {
  QUESTION_TYPES, QUESTION_TYPE_LABELS, QuestionBody, StatusBadge, badgeStyle, choiceOptions, dangerButton, downloadQuestionTemplate,
  formatDateTime, ghostButton, inputStyle, labelStyle, matchOptions, mutedText, postCsv,
  type Question, type QuestionType, type TestCourse, type TestItem, type UploadResult,
} from './testsShared'

export type DetailsTab = 'questions' | 'upload' | 'results'

type TestDetailsProps = {
  testId: number
  initialTab: DetailsTab
  courses: TestCourse[]
  onBack: () => void
  showToast: (message: string, type?: 'success' | 'error') => void
}

function TestDetails({ testId, initialTab, courses, onBack, showToast }: TestDetailsProps) {
  const [test, setTest] = useState<TestItem | null>(null)
  const [state, setState] = useState({ loading: true, error: '' })
  const [tab, setTab] = useState<DetailsTab>(initialTab)
  const [editing, setEditing] = useState(false)

  const loadTest = useCallback(async () => {
    try {
      const data = await apiFetch<{ data: TestItem }>(`/cms/tests/${testId}`)
      setTest(data.data)
      setState({ loading: false, error: '' })
    } catch (e: any) {
      setState({ loading: false, error: e.message })
    }
  }, [testId])

  useEffect(() => { loadTest() }, [loadTest])

  if (state.loading) return <div className="glass-card"><p style={mutedText}>Loading test...</p></div>
  if (state.error || !test) {
    return (
      <div className="glass-card">
        <button className="btn" style={{ ...ghostButton, marginBottom: '12px' }} onClick={onBack}>← Back to tests</button>
        <p style={{ color: '#ff8a8a' }}>Failed to load test: {state.error}</p>
      </div>
    )
  }

  const locked = test.submissionCount > 0
  const info: [string, string][] = [
    ['Course', test.courseTitle],
    ['Batch', test.targetBatch || '—'],
    ['Duration', `${test.durationMinutes} min`],
    ['Marking', `+${test.marksPositive} / −${test.marksNegative}`],
    ['Publish', formatDateTime(test.publishTime)],
    ['Close', formatDateTime(test.closeTime)],
    ['Questions', String(test.questionCount)],
    ['Submissions', String(test.submissionCount)],
    ['Created By', test.createdBy || '—'],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <button className="btn" style={{ ...ghostButton, marginBottom: '10px' }} onClick={onBack}>← Back to tests</button>
            <div style={{ ...mutedText, marginBottom: '4px' }}>Course: {test.courseTitle}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ color: 'white', fontSize: '1.3rem' }}>{test.title}</h2>
              <StatusBadge status={test.status} />
            </div>
            {test.description && <p style={{ ...mutedText, marginTop: '6px' }}>{test.description}</p>}
          </div>
          <button className="btn" onClick={() => setEditing(true)}>Edit Test</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
          {info.map(([label, value]) => (
            <div key={label} style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ ...mutedText, fontSize: '0.75rem' }}>{label}</div>
              <div style={{ color: 'white', fontSize: '0.9rem', marginTop: '2px' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {([['questions', 'Questions'], ['upload', 'Upload Questions'], ['results', 'Results']] as [DetailsTab, string][]).map(([key, label]) => (
          <button key={key} className="btn" style={tab === key ? undefined : ghostButton} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'questions' && <QuestionsPanel test={test} locked={locked} showToast={showToast} onChanged={loadTest} />}
      {tab === 'upload' && <UploadPanel test={test} locked={locked} showToast={showToast} onImported={() => { loadTest(); setTab('questions') }} />}
      {tab === 'results' && <TestResults test={test} showToast={showToast} />}

      {editing && (
        <TestFormModal
          courses={courses}
          test={test}
          showToast={showToast}
          onClose={() => setEditing(false)}
          onSaved={(saved) => { setEditing(false); setTest(saved) }}
        />
      )}
    </div>
  )
}

// ---- Questions ----

function QuestionsPanel({ test, locked, showToast, onChanged }: { test: TestItem; locked: boolean; showToast: TestDetailsProps['showToast']; onChanged: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [state, setState] = useState({ loading: true, error: '' })
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortDesc, setSortDesc] = useState(false)
  const [editing, setEditing] = useState<Question | 'new' | null>(null)
  const [previewing, setPreviewing] = useState<Question | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ data: Question[] }>(`/cms/tests/${test.id}/questions`)
      setQuestions(data.data)
      setState({ loading: false, error: '' })
    } catch (e: any) {
      setState({ loading: false, error: e.message })
    }
  }, [test.id])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const rows = questions.filter((q) => (!typeFilter || q.type === typeFilter) && (!term || q.questionText.toLowerCase().includes(term)))
    return sortDesc ? [...rows].reverse() : rows
  }, [questions, search, typeFilter, sortDesc])

  const handleDelete = async (question: Question) => {
    if (!window.confirm(`Delete question ${question.questionOrder}?`)) return
    try {
      await apiFetch(`/cms/tests/questions/${question.id}`, { method: 'DELETE' })
      showToast('Question deleted', 'success')
      load()
      onChanged()
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    }
  }

  const nextOrder = questions.reduce((max, q) => Math.max(max, q.questionOrder), 0) + 1

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h3>Questions ({questions.length})</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions" style={{ ...inputStyle, width: '200px' }} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: '190px' }}>
            <option value="">All types</option>
            {QUESTION_TYPES.map((type) => <option key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</option>)}
          </select>
          <button className="btn" style={ghostButton} onClick={() => setSortDesc(!sortDesc)}>Order {sortDesc ? '↓' : '↑'}</button>
          <button className="btn" disabled={locked} onClick={() => setEditing('new')}>+ Add Question</button>
        </div>
      </div>
      {locked && <p style={{ ...mutedText, color: '#fbbf24' }}>Students have already attempted this test, so questions can no longer be added, edited or deleted.</p>}

      {state.loading ? (
        <p style={mutedText}>Loading questions...</p>
      ) : state.error ? (
        <p style={{ color: '#ff8a8a' }}>Failed to load questions: {state.error}</p>
      ) : visible.length === 0 ? (
        <p style={mutedText}>{questions.length === 0 ? 'No questions yet. Upload a CSV or add questions one by one.' : 'No questions match the filters.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {visible.map((question) => (
            <div key={question.id} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <strong>Q{question.questionOrder}</strong>
                  <span style={{ ...badgeStyle, background: 'rgba(79,70,229,0.6)' }}>{QUESTION_TYPE_LABELS[question.type]}</span>
                  <span style={mutedText}>+{question.marksPositive ?? test.marksPositive} / −{question.marksNegative ?? test.marksNegative}</span>
                </div>
                <div style={{ color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{question.questionText}</div>
                <div style={{ ...mutedText, fontSize: '0.8rem', marginTop: '4px' }}>Answer: {question.correctAnswer.split('|').join(' or ')}</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'flex-start' }}>
                <button className="btn" style={ghostButton} onClick={() => setPreviewing(question)}>Preview</button>
                <button className="btn" style={ghostButton} disabled={locked} onClick={() => setEditing(question)}>Edit</button>
                <button className="btn" style={dangerButton} disabled={locked} onClick={() => handleDelete(question)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewing && (
        <Modal title={`Question ${previewing.questionOrder} · ${QUESTION_TYPE_LABELS[previewing.type]}`} subtitle={`${test.courseTitle} · ${test.title}`} onClose={() => setPreviewing(null)}>
          <QuestionBody question={previewing} />
        </Modal>
      )}
      {editing && (
        <QuestionFormModal
          test={test}
          question={editing === 'new' ? null : editing}
          defaultOrder={nextOrder}
          showToast={showToast}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onChanged() }}
        />
      )}
    </div>
  )
}

const ANSWER_HINTS: Record<QuestionType, string> = {
  multiple_choice: 'Option letter(s), e.g. B or A,C for more than one correct option',
  integer: 'A whole number, e.g. 5',
  fill_ups: 'The answer text. Separate accepted answers with |, e.g. New Delhi|Delhi',
  true_false: 'TRUE or FALSE',
  comprehension: 'Option letter if options are given, otherwise the answer text',
  match_the_following: 'Pairs of left letter and right number, e.g. A-2,B-1,C-4,D-3',
}

function QuestionFormModal({ test, question, defaultOrder, showToast, onClose, onSaved }: {
  test: TestItem
  question: Question | null
  defaultOrder: number
  showToast: TestDetailsProps['showToast']
  onClose: () => void
  onSaved: () => void
}) {
  const match = matchOptions(question?.options ?? null)
  const initialOptions = match ? match.left.map((o) => o.text) : choiceOptions(question?.options ?? null).map((o) => o.text)
  const [type, setType] = useState<QuestionType>(question?.type ?? 'multiple_choice')
  const [order, setOrder] = useState(String(question?.questionOrder ?? defaultOrder))
  const [text, setText] = useState(question?.questionText ?? '')
  const [passage, setPassage] = useState(question?.passage ?? '')
  const [options, setOptions] = useState<string[]>([0, 1, 2, 3].map((i) => initialOptions[i] ?? ''))
  const [matchRight, setMatchRight] = useState((match?.right ?? []).map((o) => o.text).join('\n'))
  const [answer, setAnswer] = useState(question?.correctAnswer ?? '')
  const [solution, setSolution] = useState(question?.solution ?? '')
  const [marksPositive, setMarksPositive] = useState(question?.marksPositive === null || question?.marksPositive === undefined ? '' : String(question.marksPositive))
  const [marksNegative, setMarksNegative] = useState(question?.marksNegative === null || question?.marksNegative === undefined ? '' : String(question.marksNegative))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const usesOptions = type === 'multiple_choice' || type === 'comprehension' || type === 'match_the_following'

  const handleSave = async () => {
    setIsSaving(true)
    setError('')
    try {
      const body = {
        questionOrder: Number(order),
        type,
        questionText: text,
        passage: type === 'comprehension' ? passage : null,
        options: usesOptions ? options : [],
        matchOptions: type === 'match_the_following' ? matchRight.split('\n').map((line) => line.trim()).filter(Boolean) : [],
        correctAnswer: answer,
        solution,
        marksPositive: marksPositive === '' ? null : Number(marksPositive),
        marksNegative: marksNegative === '' ? null : Number(marksNegative),
      }
      if (question) await apiFetch(`/cms/tests/questions/${question.id}`, { method: 'PUT', body })
      else await apiFetch(`/cms/tests/${test.id}/questions`, { method: 'POST', body })
      showToast(question ? 'Question updated' : 'Question added', 'success')
      onSaved()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      title={question ? `Edit Question ${question.questionOrder}` : 'Add Question'}
      subtitle={`${test.courseTitle} · ${test.title}`}
      onClose={onClose}
      width={720}
      footer={(
        <>
          <button className="btn" style={ghostButton} onClick={onClose}>Cancel</button>
          <button className="btn" disabled={isSaving} onClick={handleSave}>{isSaving ? 'Saving...' : 'Save Question'}</button>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-md)' }}>
        <div>
          <label style={labelStyle}>Order *</label>
          <input type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Question Type *</label>
          <select value={type} onChange={(e) => setType(e.target.value as QuestionType)} style={inputStyle}>
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
      </div>
      {type === 'comprehension' && (
        <div>
          <label style={labelStyle}>Passage *</label>
          <textarea rows={4} value={passage} onChange={(e) => setPassage(e.target.value)} style={inputStyle} />
        </div>
      )}
      <div>
        <label style={labelStyle}>Question Text *</label>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} style={inputStyle} />
      </div>
      {usesOptions && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
          {options.map((value, index) => (
            <div key={index}>
              <label style={labelStyle}>{type === 'match_the_following' ? `Left item ${'ABCD'[index]}` : `Option ${'ABCD'[index]}`}{index < 2 ? ' *' : ''}</label>
              <input value={value} onChange={(e) => setOptions(options.map((o, i) => (i === index ? e.target.value : o)))} style={inputStyle} />
            </div>
          ))}
        </div>
      )}
      {type === 'match_the_following' && (
        <div>
          <label style={labelStyle}>Right items * (one per line; numbered 1, 2, 3… in this order)</label>
          <textarea rows={4} value={matchRight} onChange={(e) => setMatchRight(e.target.value)} style={inputStyle} />
        </div>
      )}
      <div>
        <label style={labelStyle}>Correct Answer *</label>
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} style={inputStyle} />
        <p style={{ ...mutedText, fontSize: '0.78rem', marginTop: '4px' }}>{ANSWER_HINTS[type]}</p>
      </div>
      <div>
        <label style={labelStyle}>Solution (optional, CMS only)</label>
        <textarea rows={2} value={solution} onChange={(e) => setSolution(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <div>
          <label style={labelStyle}>Positive Marks (blank = test default {test.marksPositive})</label>
          <input type="number" min={0} step="0.25" value={marksPositive} onChange={(e) => setMarksPositive(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Negative Marks (blank = test default {test.marksNegative})</label>
          <input type="number" min={0} step="0.25" value={marksNegative} onChange={(e) => setMarksNegative(e.target.value)} style={inputStyle} />
        </div>
      </div>
      {error && <p role="alert" style={{ color: '#ff8a8a', fontSize: '0.85rem' }}>{error}</p>}
    </Modal>
  )
}

// ---- Upload (Download template → upload → preview → import) ----

function UploadPanel({ test, locked, showToast, onImported }: { test: TestItem; locked: boolean; showToast: TestDetailsProps['showToast']; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [replace, setReplace] = useState(false)
  const [preview, setPreview] = useState<UploadResult | null>(null)
  const [busy, setBusy] = useState<'' | 'checking' | 'importing'>('')

  const send = async (mode: 'preview' | 'import', picked: File, replaceExisting: boolean) => {
    const formData = new FormData()
    formData.append('file', picked)
    return postCsv(`/cms/tests/${test.id}/questions/upload?mode=${mode}&replace=${replaceExisting}`, formData)
  }

  const check = async (picked: File | null, replaceExisting: boolean) => {
    setPreview(null)
    if (!picked) return
    setBusy('checking')
    try {
      const result = await send('preview', picked, replaceExisting)
      if (result.data) setPreview(result.data)
      else showToast(result.message, 'error')
    } catch (e: any) {
      showToast('Could not check the file: ' + e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const handleImport = async () => {
    if (!file || !preview || preview.errors.length) return
    if (replace && test.questionCount > 0 && !window.confirm(`Replace all ${test.questionCount} existing questions with ${preview.validRows} from the file?`)) return
    setBusy('importing')
    try {
      const result = await send('import', file, replace)
      if (result.ok) {
        showToast(result.message, 'success')
        onImported()
      } else {
        if (result.data) setPreview(result.data)
        showToast(result.message, 'error')
      }
    } catch (e: any) {
      showToast('Import failed: ' + e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3>Upload Questions</h3>
          <p style={{ ...mutedText, marginTop: '4px' }}>1. Download the template · 2. Fill it in Excel and save as CSV UTF-8 · 3. Upload · 4. Check the preview · 5. Import</p>
        </div>
        <button className="btn" style={ghostButton} onClick={() => downloadQuestionTemplate().catch((e) => showToast(e.message, 'error'))}>Download Template</button>
      </div>
      {locked ? (
        <p style={{ ...mutedText, color: '#fbbf24' }}>Students have already attempted this test, so its questions can no longer be changed.</p>
      ) : (
        <>
          <input type="file" accept=".csv,text/csv" onChange={(e) => { const picked = e.target.files?.[0] ?? null; setFile(picked); check(picked, replace) }} style={{ ...inputStyle, padding: '8px', cursor: 'pointer' }} />
          {test.questionCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', ...mutedText }}>
              <input type="checkbox" checked={replace} onChange={(e) => { setReplace(e.target.checked); check(file, e.target.checked) }} />
              Replace the {test.questionCount} existing questions (otherwise the file is added to them)
            </label>
          )}
          {busy === 'checking' && <p style={mutedText}>Checking file...</p>}
          {preview && (
            <>
              <h4 style={{ color: 'white' }}>Upload Preview</h4>
              <UploadSummary result={preview} />
              {preview.questions.length > 0 && (
                <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {preview.questions.map((question) => (
                    <div key={question.questionOrder} style={{ padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                        <strong>Q{question.questionOrder}</strong>
                        <span style={{ ...badgeStyle, background: 'rgba(79,70,229,0.6)' }}>{QUESTION_TYPE_LABELS[question.type]}</span>
                      </div>
                      <QuestionBody question={question} />
                    </div>
                  ))}
                </div>
              )}
              <div>
                <button className="btn" disabled={busy !== '' || preview.errors.length > 0} onClick={handleImport}>
                  {busy === 'importing' ? 'Importing...' : `Import ${preview.validRows} Questions`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default TestDetails
