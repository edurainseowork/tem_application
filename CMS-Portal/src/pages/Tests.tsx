import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'
import TestFormModal from './TestFormModal'
import TestDetails, { type DetailsTab } from './TestDetails'
import {
  StatusBadge, dangerButton, formatDate, formatDateTime, formatTime, ghostButton, inputStyle, mutedText, tableStyle, tdStyle, thStyle,
  type TestCourse, type TestItem,
} from './testsShared'

type TestsProps = {
  showToast: (message: string, type?: 'success' | 'error') => void
}

type View = { kind: 'courses' } | { kind: 'course'; course: TestCourse } | { kind: 'all' }
type ListState = { loading: boolean; error: string; items: TestItem[]; total: number }

const PAGE_SIZE = 20
const actionButton = { ...ghostButton, padding: '4px 8px', fontSize: '0.75rem' }
const actionDanger = { ...dangerButton, padding: '4px 8px', fontSize: '0.75rem' }

// Sidebar → Tests: pick a course to see and create its tests, or browse all tests
function Tests({ showToast }: TestsProps) {
  const [view, setView] = useState<View>({ kind: 'courses' })
  const [courses, setCourses] = useState<TestCourse[]>([])
  const [coursesState, setCoursesState] = useState({ loading: true, error: '' })
  const [details, setDetails] = useState<{ testId: number; tab: DetailsTab } | null>(null)
  const [form, setForm] = useState<{ test?: TestItem; courseId?: number } | null>(null)

  const [list, setList] = useState<ListState>({ loading: false, error: '', items: [], total: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [page, setPage] = useState(1)

  const loadCourses = useCallback(async () => {
    setCoursesState({ loading: true, error: '' })
    try {
      const data = await apiFetch<{ data: TestCourse[] }>('/cms/tests/courses')
      setCourses(data.data)
      setCoursesState({ loading: false, error: '' })
    } catch (e: any) {
      setCoursesState({ loading: false, error: e.message })
    }
  }, [])

  const loadTests = useCallback(async () => {
    if (view.kind === 'courses') return
    setList((current) => ({ ...current, loading: true, error: '' }))
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    const courseId = view.kind === 'course' ? String(view.course.id) : courseFilter
    if (courseId) params.set('courseId', courseId)
    if (search.trim()) params.set('search', search.trim())
    if (statusFilter) params.set('status', statusFilter)
    try {
      const data = await apiFetch<{ data: TestItem[]; pagination: { total: number } }>(`/cms/tests?${params}`)
      setList({ loading: false, error: '', items: data.data, total: data.pagination.total })
    } catch (e: any) {
      setList({ loading: false, error: e.message, items: [], total: 0 })
    }
  }, [view, page, courseFilter, search, statusFilter])

  useEffect(() => { loadCourses() }, [loadCourses])
  useEffect(() => {
    const timer = setTimeout(loadTests, 250) // small delay so typing in search does not fire a request per key
    return () => clearTimeout(timer)
  }, [loadTests])

  const openView = (next: View) => {
    setView(next)
    setPage(1)
    setSearch('')
    setStatusFilter('')
    setCourseFilter('')
  }

  const refresh = () => { loadTests(); loadCourses() }

  const handleDelete = async (test: TestItem) => {
    const message = test.submissionCount > 0
      ? `"${test.title}" has ${test.submissionCount} submissions. It will be archived (hidden) and its results kept. Continue?`
      : `Delete "${test.title}" and its ${test.questionCount} questions? This cannot be undone.`
    if (!window.confirm(message)) return
    try {
      const data = await apiFetch<{ message: string }>(`/cms/tests/${test.id}`, { method: 'DELETE' })
      showToast(data.message, 'success')
      refresh()
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    }
  }

  if (details) {
    return (
      <TestDetails
        testId={details.testId}
        initialTab={details.tab}
        courses={courses}
        showToast={showToast}
        onBack={() => { setDetails(null); refresh() }}
      />
    )
  }

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" style={view.kind === 'all' ? ghostButton : undefined} onClick={() => openView({ kind: 'courses' })}>By Course</button>
          <button className="btn" style={view.kind === 'all' ? undefined : ghostButton} onClick={() => openView({ kind: 'all' })}>All Tests</button>
        </div>
        <button className="btn" onClick={() => setForm({ courseId: view.kind === 'course' ? view.course.id : undefined })}>+ Create Test</button>
      </div>

      {view.kind === 'courses' && (
        <div className="glass-card">
          <h3 style={{ marginBottom: '6px' }}>Courses</h3>
          <p style={{ ...mutedText, marginBottom: 'var(--space-md)' }}>Click a course to see its tests or create a new one.</p>
          {coursesState.loading ? (
            <p style={mutedText}>Loading courses...</p>
          ) : coursesState.error ? (
            <p style={{ color: '#ff8a8a' }}>Failed to load courses: {coursesState.error}</p>
          ) : courses.length === 0 ? (
            <p style={mutedText}>No courses found. Create a course first in the Course Manager.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-md)' }}>
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => openView({ kind: 'course', course })}
                  style={{ textAlign: 'left', cursor: 'pointer', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', display: 'flex', flexDirection: 'column', gap: '6px' }}
                >
                  <strong style={{ fontSize: '0.95rem' }}>{course.title}</strong>
                  <span style={mutedText}>{course.category}{course.isPublished ? '' : ' · unpublished'}</span>
                  <span style={{ fontSize: '0.8rem', color: course.testCount ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                    {course.testCount} {course.testCount === 1 ? 'test' : 'tests'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view.kind !== 'courses' && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              {view.kind === 'course' && (
                <button className="btn" style={{ ...ghostButton, marginBottom: '8px' }} onClick={() => openView({ kind: 'courses' })}>← All courses</button>
              )}
              <h3>{view.kind === 'course' ? `Course: ${view.course.title}` : 'All Tests'}</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search test or course" style={{ ...inputStyle, width: '220px' }} />
              {view.kind === 'all' && (
                <select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1) }} style={{ ...inputStyle, width: '200px' }}>
                  <option value="">All courses</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                </select>
              )}
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} style={{ ...inputStyle, width: '160px' }}>
                <option value="">All statuses</option>
                {['DRAFT', 'SCHEDULED', 'PUBLISHED', 'COMPLETED'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>

          {list.loading && list.items.length === 0 ? (
            <p style={mutedText}>Loading tests...</p>
          ) : list.error ? (
            <p style={{ color: '#ff8a8a' }}>Failed to load tests: {list.error}</p>
          ) : list.items.length === 0 ? (
            <p style={mutedText}>No tests found.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {/* Inside a course the heading already names it, so the Course column is only shown in All Tests */}
                    {[...(view.kind === 'all' ? ['Course'] : []), 'Test Name', 'Batch', 'Duration', 'Questions', 'Publish Date / Time', 'Status', 'Created By / At', 'Actions'].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((test) => (
                    <tr key={test.id}>
                      {view.kind === 'all' && <td style={tdStyle}>{test.courseTitle}</td>}
                      <td style={{ ...tdStyle, fontWeight: 600, cursor: 'pointer' }} onClick={() => setDetails({ testId: test.id, tab: 'questions' })}>{test.title}</td>
                      <td style={tdStyle}>{test.targetBatch || '—'}</td>
                      <td style={tdStyle}>{test.durationMinutes} min</td>
                      <td style={tdStyle}>{test.questionCount}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(test.publishTime)}<div style={mutedText}>{formatTime(test.publishTime)}</div></td>
                      <td style={tdStyle}>
                        <StatusBadge status={test.status} />
                        {test.closeTime && <div style={{ ...mutedText, fontSize: '0.72rem', marginTop: '4px' }}>closes {formatDateTime(test.closeTime)}</div>}
                      </td>
                      <td style={{ ...tdStyle, ...mutedText, fontSize: '0.78rem', overflowWrap: 'anywhere', minWidth: '130px' }}>{test.createdBy || '—'}<div>{formatDate(test.createdAt)}</div></td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '120px' }}>
                          <button className="btn" style={actionButton} onClick={() => setDetails({ testId: test.id, tab: 'questions' })}>Questions</button>
                          <button className="btn" style={actionButton} onClick={() => setForm({ test })}>Edit</button>
                          <button className="btn" style={actionButton} onClick={() => setDetails({ testId: test.id, tab: 'upload' })}>Upload</button>
                          <button className="btn" style={actionButton} onClick={() => setDetails({ testId: test.id, tab: 'results' })}>Results ({test.submissionCount})</button>
                          <button className="btn" style={actionDanger} onClick={() => handleDelete(test)}>{test.submissionCount > 0 ? 'Archive' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {list.total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
              <span style={mutedText}>Page {page} of {totalPages} · {list.total} tests</span>
              <button className="btn" style={ghostButton} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button className="btn" style={ghostButton} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </div>
      )}

      {form && (
        <TestFormModal
          courses={courses}
          initialCourseId={form.courseId}
          test={form.test}
          showToast={showToast}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null)
            refresh()
            // After creating a test, jump to that course so the new test is visible
            if (!form.test && view.kind !== 'all') {
              const course = courses.find((c) => c.id === saved.courseId)
              if (course && (view.kind !== 'course' || view.course.id !== course.id)) openView({ kind: 'course', course })
            }
          }}
        />
      )}
    </div>
  )
}

export default Tests
