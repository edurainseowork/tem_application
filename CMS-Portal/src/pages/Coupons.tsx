import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { CouponBody } from '@workspace/api-zod'

type Course = { id: number; title: string; category: string }

type Coupon = {
  id: number
  code: string
  discountPercent: number
  isPublic: boolean
  usageLimit: number | null
  usedCount: number
  courseIds: number[]
  appliesToAllCourses: boolean
  status: 'active' | 'expired'
}

type CouponsProps = {
  user: User
  coursesList: Course[]
  showToast: (message: string, type?: 'success' | 'error') => void
}

import { API_BASE_URL } from '../api'

const API_URL = `${API_BASE_URL}/api`

const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' } as const
const labelStyle = { display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' } as const
const badgeStyle = { fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '999px', color: 'white' } as const

function Coupons({ user, coursesList, showToast }: CouponsProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)

  const [code, setCode] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [courseIds, setCourseIds] = useState<number[]>([])
  const [usageLimit, setUsageLimit] = useState('')
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

  const fetchCoupons = async () => {
    try {
      const data = await authFetch('/coupons')
      setCoupons(data.data)
    } catch (e: any) {
      showToast('Failed to load coupons: ' + e.message, 'error')
    }
  }

  // Load the coupon list once when the tab opens
  useEffect(() => {
    fetchCoupons()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setCode('')
    setDiscountPercent('')
    setIsPublic(true)
    setCourseIds([])
    setUsageLimit('')
  }

  const startEdit = (coupon: Coupon) => {
    setEditingId(coupon.id)
    setCode(coupon.code)
    setDiscountPercent(String(coupon.discountPercent))
    setIsPublic(coupon.isPublic)
    // Legacy coupons apply to every course: pre-select all so saving keeps that behaviour unless the admin narrows it
    setCourseIds(coupon.appliesToAllCourses ? coursesList.map((course) => course.id) : coupon.courseIds)
    setUsageLimit(coupon.usageLimit === null ? '' : String(coupon.usageLimit))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleCourse = (id: number) => {
    setCourseIds((current) => current.includes(id) ? current.filter((courseId) => courseId !== id) : [...current, id])
  }

  const allSelected = coursesList.length > 0 && coursesList.every((course) => courseIds.includes(course.id))

  const handleSave = async () => {
    const parsed = CouponBody.safeParse({
      code,
      discountPercent,
      isPublic,
      courseIds,
      usageLimit: isPublic || usageLimit.trim() === '' ? null : usageLimit,
    })
    if (!parsed.success) {
      showToast(parsed.error.issues[0]?.message || 'Please check the coupon details.', 'error')
      return
    }
    const editing = editingId !== null ? coupons.find((coupon) => coupon.id === editingId) : undefined
    if (editing && parsed.data.usageLimit !== null && parsed.data.usageLimit < editing.usedCount) {
      showToast(`Frequency cannot be lower than the current usage (${editing.usedCount})`, 'error')
      return
    }

    setIsSaving(true)
    try {
      await authFetch(editingId !== null ? `/coupons/${editingId}` : '/coupons', {
        method: editingId !== null ? 'PUT' : 'POST',
        body: JSON.stringify(parsed.data),
      })
      showToast(editingId !== null ? `Coupon ${parsed.data.code} updated` : `Coupon ${parsed.data.code} created`, 'success')
      resetForm()
      fetchCoupons()
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (coupon: Coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}? Students will no longer be able to use it.`)) return
    try {
      await authFetch(`/coupons/${coupon.id}`, { method: 'DELETE' })
      showToast(`Coupon ${coupon.code} deleted`, 'success')
      if (editingId === coupon.id) resetForm()
      fetchCoupons()
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    }
  }

  const courseTitle = (id: number) => coursesList.find((course) => course.id === id)?.title ?? `Course #${id}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>{editingId !== null ? `Edit Coupon ${code}` : 'Generate Coupons'}</h3>
        <form noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }} onSubmit={(e) => { e.preventDefault(); handleSave() }}>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Coupon Code</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. DIWALI50" maxLength={30} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Discount (%)</label>
              <input type="number" min={1} max={100} value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} placeholder="e.g. 20" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Coupon Type</label>
              <select value={isPublic ? 'public' : 'private'} onChange={e => setIsPublic(e.target.value === 'public')} style={inputStyle}>
                <option value="public">Public (Visible to everyone)</option>
                <option value="private">Private (Hidden, applies only via link/code)</option>
              </select>
            </div>
            {!isPublic && (
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Frequency (max uses) *</label>
                <input type="number" min={1} step={1} value={usageLimit} onChange={e => setUsageLimit(e.target.value)} placeholder="e.g. 500" style={inputStyle} />
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ color: 'var(--text-secondary)' }}>Applicable Courses * ({courseIds.length} selected)</label>
              {coursesList.length > 0 && (
                <span style={{ cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.85rem' }} onClick={() => setCourseIds(allSelected ? [] : coursesList.map((course) => course.id))}>
                  {allSelected ? 'Clear all' : 'Select all'}
                </span>
              )}
            </div>
            {coursesList.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No courses found. Create a course first in the Course Manager.</p>
            ) : (
              <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                {coursesList.map((course) => (
                  <label key={course.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', background: courseIds.includes(course.id) ? 'rgba(255,94,94,0.12)' : 'transparent' }}>
                    <input type="checkbox" checked={courseIds.includes(course.id)} onChange={() => toggleCourse(course.id)} />
                    <span style={{ color: 'white' }}>{course.title}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{course.category}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="submit" disabled={isSaving} className="btn">
              {isSaving ? 'Saving...' : editingId !== null ? 'Save Changes' : 'Generate Coupon'}
            </button>
            {editingId !== null && (
              <button type="button" onClick={resetForm} className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}>Cancel Edit</button>
            )}
          </div>
        </form>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Existing Coupons</h3>
        {coupons.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No coupons yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {coupons.map((coupon) => {
              const usagePercent = coupon.usageLimit ? Math.min(100, (coupon.usedCount / coupon.usageLimit) * 100) : 0
              return (
                <div key={coupon.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: `1px solid ${editingId === coupon.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)'}` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <h4 style={{ color: 'white', letterSpacing: '0.5px' }}>{coupon.code}</h4>
                      <span style={{ ...badgeStyle, background: 'rgba(255,255,255,0.1)' }}>{coupon.discountPercent}% OFF</span>
                      <span style={{ ...badgeStyle, background: coupon.isPublic ? 'rgba(79,70,229,0.6)' : 'rgba(255,255,255,0.1)' }}>{coupon.isPublic ? 'PUBLIC' : 'PRIVATE'}</span>
                      <span style={{ ...badgeStyle, background: coupon.status === 'active' ? 'rgba(29,154,120,0.7)' : '#ff5e5e' }}>{coupon.status === 'active' ? 'ACTIVE' : 'EXPIRED'}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      {coupon.appliesToAllCourses ? 'All courses (created before course selection; edit to restrict)' : coupon.courseIds.map(courseTitle).join(', ')}
                    </div>
                    {coupon.usageLimit !== null ? (
                      <div style={{ maxWidth: '320px' }}>
                        <div style={{ fontSize: '0.8rem', color: 'white', marginBottom: '4px' }}>{coupon.usedCount} / {coupon.usageLimit} used</div>
                        <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${usagePercent}%`, background: coupon.status === 'active' ? 'var(--accent-primary)' : '#ff5e5e' }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'white' }}>{coupon.usedCount} used · unlimited</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => startEdit(coupon)} className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', fontSize: '0.8rem' }}>Edit</button>
                    <button onClick={() => handleDelete(coupon)} className="btn" style={{ background: '#ff5e5e', border: 'none', padding: '6px 12px', fontSize: '0.8rem' }}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Coupons
