import { useState } from 'react'
import { apiFetch } from '../api'
import Modal from '../components/Modal'
import {
  downloadQuestionTemplate, ghostButton, inputStyle, labelStyle, mutedText, postCsv, toIso, toLocalParts,
  type TestCourse, type TestItem, type UploadResult,
} from './testsShared'

type TestFormModalProps = {
  courses: TestCourse[]
  initialCourseId?: number
  test?: TestItem // editing when set
  onClose: () => void
  onSaved: (test: TestItem) => void
  showToast: (message: string, type?: 'success' | 'error') => void
}

const todayLocal = () => toLocalParts(new Date().toISOString()).date

// Create Test (course, title, date, time, CSV questions → Save) and Edit Test
function TestFormModal({ courses, initialCourseId, test, onClose, onSaved, showToast }: TestFormModalProps) {
  const isEdit = Boolean(test)
  const publish = toLocalParts(test?.publishTime ?? null)
  const close = toLocalParts(test?.closeTime ?? null)
  const locked = isEdit && (test?.submissionCount ?? 0) > 0

  const [courseId, setCourseId] = useState(String(test?.courseId ?? initialCourseId ?? ''))
  const [title, setTitle] = useState(test?.title ?? '')
  const [description, setDescription] = useState(test?.description ?? '')
  const [targetBatch, setTargetBatch] = useState(test?.targetBatch ?? '')
  const [durationMinutes, setDurationMinutes] = useState(String(test?.durationMinutes ?? 60))
  const [marksPositive, setMarksPositive] = useState(String(test?.marksPositive ?? 4))
  const [marksNegative, setMarksNegative] = useState(String(test?.marksNegative ?? 1))
  const [publishDate, setPublishDate] = useState(publish.date)
  const [publishTime, setPublishTime] = useState(publish.time)
  const [closeDate, setCloseDate] = useState(close.date)
  const [closeTime, setCloseTime] = useState(close.time)
  const [status, setStatus] = useState<'DRAFT' | 'SCHEDULED'>(test?.storedStatus === 'SCHEDULED' ? 'SCHEDULED' : 'DRAFT')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<UploadResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (picked: File | null) => {
    setFile(picked)
    setPreview(null)
    if (!picked) return
    setIsChecking(true)
    try {
      const formData = new FormData()
      formData.append('file', picked)
      const result = await postCsv('/cms/tests/questions/preview', formData)
      if (result.data) setPreview(result.data)
      else showToast(result.message, 'error')
    } catch (e: any) {
      showToast('Could not check the file: ' + e.message, 'error')
    } finally {
      setIsChecking(false)
    }
  }

  const validate = (): string | null => {
    if (!courseId) return 'Course is required'
    if (title.trim().length < 3) return 'Test title must be at least 3 characters'
    if (!(Number(durationMinutes) > 0)) return 'Duration must be greater than 0'
    if (marksPositive === '' || Number(marksPositive) < 0) return 'Positive marks cannot be negative'
    if (marksNegative === '' || Number(marksNegative) < 0) return 'Negative marks cannot be negative'
    if (!publishDate || !publishTime) return 'Publish date and time are required'
    if ((closeDate && !closeTime) || (!closeDate && closeTime)) return 'Give both a close date and time, or leave both empty'
    if (closeDate && toIso(closeDate, closeTime) <= toIso(publishDate, publishTime)) return 'Close time must be after the publish time'
    if (preview && preview.errors.length) return 'Fix the errors in the CSV file first'
    if (!isEdit && status === 'SCHEDULED' && !(preview && preview.validRows > 0)) return 'Upload a questions CSV to schedule the test, or save it as a draft'
    return null
  }

  const handleSave = async () => {
    const problem = validate()
    setError(problem ?? '')
    if (problem) return

    const fields = {
      title: title.trim(),
      description: description.trim(),
      targetBatch: targetBatch.trim(),
      durationMinutes: Number(durationMinutes),
      marksPositive: Number(marksPositive),
      marksNegative: Number(marksNegative),
      // Unchanged inputs keep the exact stored time (inputs only have minute precision)
      publishTime: test && publishDate === publish.date && publishTime === publish.time ? test.publishTime : toIso(publishDate, publishTime),
      closeTime: !closeDate ? null : test?.closeTime && closeDate === close.date && closeTime === close.time ? test.closeTime : toIso(closeDate, closeTime),
      status,
    }
    setIsSaving(true)
    try {
      let saved: { data: TestItem; message: string }
      if (isEdit) {
        saved = await apiFetch(`/cms/tests/${test!.id}`, { method: 'PUT', body: fields })
      } else {
        const formData = new FormData()
        formData.append('courseId', courseId)
        Object.entries(fields).forEach(([key, value]) => formData.append(key, value === null ? '' : String(value)))
        if (file) formData.append('file', file)
        saved = await apiFetch('/cms/tests', { method: 'POST', formData })
      }
      showToast(saved.message, 'success')
      onSaved(saved.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsSaving(false)
    }
  }

  const courseTitle = courses.find((course) => String(course.id) === courseId)?.title

  return (
    <Modal
      title={isEdit ? 'Edit Test' : 'Create Test'}
      subtitle={courseTitle ? `Course: ${courseTitle}` : undefined}
      onClose={onClose}
      width={720}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn" style={ghostButton}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={isSaving || isChecking} className="btn">{isSaving ? 'Saving...' : 'Save'}</button>
        </>
      )}
    >
      {locked && (
        <p style={{ ...mutedText, color: '#fbbf24' }}>Students have already attempted this test, so only the title, description, batch and close time can be changed.</p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Course *</label>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={isEdit} style={inputStyle}>
            <option value="">Select a course</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Test Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Java OOP Assessment - Test 1" style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Target Batch (label)</label>
          <input value={targetBatch} onChange={(e) => setTargetBatch(e.target.value)} maxLength={100} placeholder="e.g. JEE 2026" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Duration (minutes) *</label>
          <input type="number" min={1} max={600} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} disabled={locked} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Positive Marks *</label>
          <input type="number" min={0} step="0.25" value={marksPositive} onChange={(e) => setMarksPositive(e.target.value)} disabled={locked} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Negative Marks *</label>
          <input type="number" min={0} step="0.25" value={marksNegative} onChange={(e) => setMarksNegative(e.target.value)} disabled={locked} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Publish Date *</label>
          <input type="date" min={isEdit ? undefined : todayLocal()} value={publishDate} onChange={(e) => setPublishDate(e.target.value)} disabled={locked} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Publish Time *</label>
          <input type="time" value={publishTime} onChange={(e) => setPublishTime(e.target.value)} disabled={locked} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Close Date (optional)</label>
          <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Close Time (optional)</label>
          <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'SCHEDULED')} disabled={locked} style={inputStyle}>
            <option value="DRAFT">Draft (not visible to students)</option>
            <option value="SCHEDULED">Schedule (goes live automatically at the publish time)</option>
          </select>
          <p style={{ ...mutedText, marginTop: '6px', fontSize: '0.78rem' }}>
            There is no lock/unlock button: a scheduled test becomes live at the publish time{closeDate ? ' and closes at the close time' : ''}, by the server clock.
          </p>
        </div>
      </div>

      {!isEdit && (
        <div style={{ padding: '12px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Questions CSV (optional now, required to schedule)</label>
            <button type="button" className="btn" style={ghostButton} onClick={() => downloadQuestionTemplate().catch((e) => showToast(e.message, 'error'))}>Download Template</button>
          </div>
          <input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} style={{ ...inputStyle, padding: '8px', cursor: 'pointer' }} />
          {isChecking && <p style={{ ...mutedText, marginTop: '8px' }}>Checking file...</p>}
          {preview && <UploadSummary result={preview} />}
        </div>
      )}

      {error && <p role="alert" style={{ color: '#ff8a8a', fontSize: '0.85rem' }}>{error}</p>}
    </Modal>
  )
}

// "Total 100 · Valid 96 · Invalid 4" plus the row errors
export function UploadSummary({ result }: { result: UploadResult }) {
  const ok = result.errors.length === 0
  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
        <span>Total Rows: <strong>{result.totalRows}</strong></span>
        <span style={{ color: '#6ee7b7' }}>Valid: <strong>{result.validRows}</strong></span>
        <span style={{ color: result.invalidRows ? '#ff8a8a' : 'var(--text-secondary)' }}>Invalid: <strong>{result.invalidRows}</strong></span>
      </div>
      {ok ? (
        <p style={{ color: '#6ee7b7', fontSize: '0.85rem' }}>All rows are valid. {result.validRows} questions will be saved.</p>
      ) : (
        <>
          <p style={{ color: '#ff8a8a', fontSize: '0.85rem' }}>Question upload failed. Please fix the highlighted errors and try again. Nothing is saved until every row is valid.</p>
          <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.82rem', background: 'rgba(255,94,94,0.08)', border: '1px solid rgba(255,94,94,0.3)', borderRadius: '6px', padding: '8px 10px' }}>
            {result.errors.map((error, index) => (
              <div key={index}>{error.row > 0 ? `Row ${error.row} – ` : ''}{error.message}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default TestFormModal
