import { useState } from 'react'
import type { User } from 'firebase/auth'
import { CreateLiveClassBody } from '@workspace/api-zod'

type Course = { id: number; title: string; category: string; thumbnail: string }

type LiveClass = {
  id: number
  title: string
  startTime: string
  endTime: string
  meetUrl: string
  status: 'live' | 'upcoming' | 'ended'
}

type GoLiveProps = {
  user: User
  coursesList: Course[]
  showToast: (message: string, type?: 'success' | 'error') => void
}

const API_URL = 'http://localhost:5000/api'

const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', colorScheme: 'dark' } as const
const labelStyle = { display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' } as const

// Local "YYYY-MM-DD" for today, used as the date picker minimum
const todayLocal = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const formatWindow = (startTime: string, endTime: string) => {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const day = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time(start)} – ${time(end)}`
}

function GoLive({ user, coursesList, showToast }: GoLiveProps) {
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([])

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [meetUrl, setMeetUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const authFetch = async (path: string, init: RequestInit = {}) => {
    const token = await user.getIdToken()
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data
  }

  const fetchLiveClasses = async (courseId: number) => {
    try {
      const data = await authFetch(`/courses/${courseId}/live-classes`)
      setLiveClasses(data.data)
    } catch (e: any) {
      showToast('Failed to load live classes: ' + e.message, 'error')
    }
  }

  const selectCourse = (course: Course | null) => {
    setSelectedCourse(course)
    setLiveClasses([])
    if (course) fetchLiveClasses(course.id)
  }

  const resetForm = () => {
    setTitle('')
    setDate(todayLocal())
    setStartTime('')
    setEndTime('')
    setMeetUrl('')
  }

  const handleCreate = async () => {
    if (!selectedCourse) return
    if (!date || !startTime || !endTime) {
      showToast('Please select a date, start time and end time.', 'error')
      return
    }

    // Date and times are entered in the admin's local timezone and sent as UTC ISO strings
    const start = new Date(`${date}T${startTime}`)
    const end = new Date(`${date}T${endTime}`)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      showToast('Please enter a valid date and time.', 'error')
      return
    }

    const parsed = CreateLiveClassBody.safeParse({
      title,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      meetUrl,
    })
    if (!parsed.success) {
      showToast(parsed.error.issues[0]?.message || 'Please check the live class details.', 'error')
      return
    }

    setIsSaving(true)
    try {
      const data = await authFetch(`/courses/${selectedCourse.id}/live-classes`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      })
      const students = data.notifiedCount === 1 ? 'student' : 'students'
      showToast(`Live class created. ${data.notifiedCount} enrolled ${students} notified.`, 'success')
      resetForm()
      fetchLiveClasses(selectedCourse.id)
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleNotify = async (id: number) => {
    try {
      const data = await authFetch(`/live-classes/${id}/notify`, { method: 'POST' })
      showToast(data.notifiedCount > 0 ? `Notified ${data.notifiedCount} more student(s).` : 'All enrolled students were already notified.', 'success')
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    }
  }

  const handleDelete = async (id: number) => {
    if (!selectedCourse || !window.confirm('Cancel this live class? Students will no longer see it.')) return
    try {
      await authFetch(`/live-classes/${id}`, { method: 'DELETE' })
      showToast('Live class cancelled', 'success')
      fetchLiveClasses(selectedCourse.id)
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    }
  }

  if (!selectedCourse) {
    return (
      <div className="glass-card">
        <h3 style={{ marginBottom: '8px' }}>Select a Course</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>
          Choose the course you want to schedule a live class for. Enrolled students will be notified automatically.
        </p>
        {coursesList.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No courses found. Create a course first in the Course Manager.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {coursesList.map((course) => (
              <div
                key={course.id}
                onClick={() => selectCourse(course)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {course.thumbnail && <img src={course.thumbnail} alt="" style={{ width: '64px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} />}
                  <div>
                    <h4 style={{ color: 'white', marginBottom: '4px' }}>{course.title}</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{course.category}</span>
                  </div>
                </div>
                <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold', fontSize: '0.9rem' }}>Go Live →</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        <span style={{ cursor: 'pointer', color: 'var(--accent-primary)' }} onClick={() => { selectCourse(null); resetForm() }}>All Courses</span>
        <span>/</span>
        <span style={{ color: 'white' }}>{selectedCourse.title}</span>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Create Live Class</h3>
        {/* noValidate: the shared schema validates, and accepts Meet links pasted without https:// */}
        <form noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }} onSubmit={(e) => { e.preventDefault(); handleCreate() }}>
          <div>
            <label style={labelStyle}>Live Class Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. React Native Live Session" maxLength={150} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Date</label>
              <input type="date" value={date} min={todayLocal()} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Google Meet Link</label>
            <input type="url" value={meetUrl} onChange={e => setMeetUrl(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" style={inputStyle} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              Create the meeting in Google Meet / Calendar first, then paste its link here.
            </p>
          </div>
          <button type="submit" disabled={isSaving} className="btn" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-sm)' }}>
            {isSaving ? 'Saving...' : 'Save & Notify Students'}
          </button>
        </form>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Live & Upcoming Classes</h3>
        {liveClasses.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No live classes scheduled for this course.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {liveClasses.map((liveClass) => (
              <div key={liveClass.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h4 style={{ color: 'white' }}>{liveClass.title}</h4>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '999px', background: liveClass.status === 'live' ? '#ff5e5e' : 'rgba(255,255,255,0.1)', color: 'white' }}>
                      {liveClass.status === 'live' ? 'LIVE NOW' : 'UPCOMING'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatWindow(liveClass.startTime, liveClass.endTime)}</span>
                  <div><a href={liveClass.meetUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', wordBreak: 'break-all' }}>{liveClass.meetUrl}</a></div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => handleNotify(liveClass.id)} className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', fontSize: '0.8rem' }}>Re-notify</button>
                  <button onClick={() => handleDelete(liveClass.id)} className="btn" style={{ background: '#ff5e5e', border: 'none', padding: '6px 12px', fontSize: '0.8rem' }}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default GoLive
