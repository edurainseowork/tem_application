import { useEffect, useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { apiFetch, ApiError } from '../api'
import Modal from '../components/Modal'
import { badgeStyle, dangerButton, formatDateTime, ghostButton, inputStyle, labelStyle, mutedText, tableStyle, tdStyle, thStyle } from './testsShared'

export type StaffRole = 'admin' | 'mentor' | 'teacher_assistant'

type AdminItem = {
  uid: string
  email: string
  name: string | null
  role: StaffRole
  status: 'ACTIVE' | 'INVITED' | 'DISABLED' | 'NO_ACCOUNT'
  isSuperAdmin: boolean
  isSelf: boolean
  canDelete: boolean
  createdAt: string | null
  lastSignInAt: string | null
}

type ManageAdminsProps = {
  showToast: (message: string, type?: 'success' | 'error') => void
  // Opened from the header's "Invite User" button
  openCreate: boolean
  onCreateOpened: () => void
}

// Roles the Super Admin can invite. Admins work in this CMS; Mentors and Teacher Assistance
// sign in on the study website and only see their own desk (the backend enforces this).
const ROLES: Record<StaffRole, { label: string; plural: string; hint: string; color: string }> = {
  admin: { label: 'Admin', plural: 'Admins', hint: 'Full access to this CMS.', color: 'rgba(79,70,229,0.8)' },
  mentor: { label: 'Mentor', plural: 'Mentors', hint: 'Signs in to this CMS and only sees the Mentor Desk.', color: 'rgba(14,116,144,0.85)' },
  teacher_assistant: {
    label: 'Teacher Assistance',
    plural: 'Teacher Assistance',
    hint: 'Signs in on the study website and only sees the Teacher Assistance Desk.',
    color: 'rgba(180,83,9,0.85)',
  },
}
const ROLE_ORDER: StaffRole[] = ['admin', 'mentor', 'teacher_assistant']

const STATUS: Record<AdminItem['status'], { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'rgba(29,154,120,0.8)' },
  INVITED: { label: 'Invited', color: 'rgba(214,158,46,0.85)' },
  DISABLED: { label: 'Disabled', color: '#ff5e5e' },
  NO_ACCOUNT: { label: 'No account', color: 'rgba(255,255,255,0.15)' },
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Where the "set your password" email sends people afterwards: admins back to this CMS,
// mentors and teacher assistance to the study website's login page.
const STUDY_URL = (import.meta.env.VITE_STUDY_URL || 'http://localhost:5173/study/').trim()
const continueUrlFor = (role: StaffRole) =>
  role === 'admin' ? window.location.origin : role === 'mentor' ? `${window.location.origin}/mentorDesk` : STUDY_URL
// Firebase sends the "set your password" email (its Password reset template). The link is a
// one-time code that expires; the password is stored by Firebase Auth, never by us.
const sendSetPasswordEmail = async (email: string, role: StaffRole) => {
  try {
    await sendPasswordResetEmail(auth, email, { url: continueUrlFor(role) })
  } catch (err: any) {
    // The continue URL's domain must be authorized in Firebase; retry without it
    if (err?.code === 'auth/unauthorized-continue-uri' || err?.code === 'auth/invalid-continue-uri') {
      await sendPasswordResetEmail(auth, email)
      return
    }
    throw err
  }
}

const roleBadge = (role: StaffRole) => (
  <span style={{ ...badgeStyle, background: ROLES[role]?.color ?? 'rgba(255,255,255,0.15)' }}>{ROLES[role]?.label ?? role}</span>
)

// Super Admin only. The backend (requireSuperAdmin) enforces the same rule on every request.
function ManageAdmins({ showToast, openCreate, onCreateOpened }: ManageAdminsProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [admins, setAdmins] = useState<AdminItem[]>([])
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all')

  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<StaffRole>('admin')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [resending, setResending] = useState<string | null>(null)

  const [toDelete, setToDelete] = useState<AdminItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    try {
      const res = await apiFetch<{ data: AdminItem[] }>('/cms/admins')
      setAdmins(res.data.map((a) => ({ ...a, role: a.role ?? 'admin' })))
      setLoadError('')
    } catch (e: any) {
      setLoadError(e instanceof ApiError && e.status === 403 ? e.message : 'Failed to load users: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (openCreate) {
      openCreateModal()
      onCreateOpened()
    }
  }, [openCreate])

  const openCreateModal = (role: StaffRole = 'admin') => {
    setNewEmail('')
    setNewName('')
    setNewRole(role)
    setCreateError('')
    setShowCreate(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    const name = newName.trim()
    if (newRole !== 'admin' && !name) return setCreateError('Name is required')
    if (name.length > 80) return setCreateError('Name is too long')
    if (!email) return setCreateError('Email is required')
    if (!EMAIL_PATTERN.test(email)) return setCreateError('Enter a valid email address')

    setCreateError('')
    setCreating(true)
    const label = ROLES[newRole].label
    try {
      await apiFetch('/cms/admins', { method: 'POST', body: { email, role: newRole, ...(name ? { name } : {}) } })
      try {
        await sendSetPasswordEmail(email, newRole)
        showToast(`${email} was invited as ${label}. A "set your password" email was sent.`, 'success')
      } catch (err: any) {
        showToast(`${email} was invited as ${label}, but the email could not be sent (${err?.code || err?.message}). Use "Resend Email".`, 'error')
      }
      setShowCreate(false)
      load()
    } catch (err: any) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleResend = async (admin: AdminItem) => {
    setResending(admin.uid)
    try {
      await sendSetPasswordEmail(admin.email, admin.role)
      showToast(`Password email sent to ${admin.email}`, 'success')
    } catch (err: any) {
      showToast('Could not send the email: ' + (err?.code || err?.message), 'error')
    } finally {
      setResending(null)
    }
  }

  const handleDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await apiFetch(`/cms/admins/${encodeURIComponent(toDelete.uid)}`, { method: 'DELETE' })
      setAdmins((list) => list.filter((a) => a.uid !== toDelete.uid))
      showToast(`${toDelete.email} is no longer ${toDelete.role === 'admin' ? 'an' : 'a'} ${ROLES[toDelete.role].label}`, 'success')
      setToDelete(null)
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="glass-card"><p style={mutedText}>Loading users...</p></div>
  }

  if (loadError) {
    return (
      <div className="glass-card">
        <p role="alert" style={{ color: '#ff8a8a', marginBottom: 'var(--space-md)' }}>{loadError}</p>
        <button type="button" className="btn" onClick={() => { setLoading(true); load() }}>Retry</button>
      </div>
    )
  }

  const counts = ROLE_ORDER.reduce((acc, role) => ({ ...acc, [role]: admins.filter((a) => a.role === role).length }), {} as Record<StaffRole, number>)
  const visible = roleFilter === 'all' ? admins : admins.filter((a) => a.role === roleFilter)
  const filterButton = (id: 'all' | StaffRole, text: string) => (
    <button
      key={id}
      type="button"
      className="btn"
      onClick={() => setRoleFilter(id)}
      style={roleFilter === id ? { padding: '6px 12px', fontSize: '0.8rem' } : ghostButton}
    >
      {text}
    </button>
  )

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
        <div>
          <h3>Users ({admins.length})</h3>
          <p style={{ ...mutedText, marginTop: '4px' }}>
          Admins share the same CMS access. Mentors only see the Mentor Desk here; Teacher Assistance only use their desk on the study website. Only you can add or remove users.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => openCreateModal(roleFilter === 'all' ? 'admin' : roleFilter)}>+ Invite User</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
        {filterButton('all', `All (${admins.length})`)}
        {ROLE_ORDER.map((role) => filterButton(role, `${ROLES[role].plural} (${counts[role]})`))}
      </div>

      {visible.length === 0 ? (
        <p style={mutedText}>{roleFilter === 'all' ? 'No users yet.' : `No ${ROLES[roleFilter].plural} yet.`}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Last sign-in</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((admin) => (
                <tr key={admin.uid}>
                  <td style={tdStyle}>
                    <div style={{ wordBreak: 'break-all' }}>{admin.email}</div>
                    {admin.name && <div style={{ ...mutedText, fontSize: '0.75rem' }}>{admin.name}</div>}
                    {admin.isSuperAdmin && <span style={{ ...badgeStyle, background: 'rgba(79,70,229,0.8)', marginTop: '4px' }}>Super Admin{admin.isSelf ? ' (you)' : ''}</span>}
                  </td>
                  <td style={tdStyle}>{roleBadge(admin.role)}</td>
                  <td style={tdStyle}><span style={{ ...badgeStyle, background: STATUS[admin.status].color }}>{STATUS[admin.status].label}</span></td>
                  <td style={tdStyle}>{formatDateTime(admin.createdAt)}</td>
                  <td style={tdStyle}>{formatDateTime(admin.lastSignInAt)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {admin.status === 'INVITED' && (
                        <button type="button" className="btn" style={ghostButton} disabled={resending === admin.uid} onClick={() => handleResend(admin)}>
                          {resending === admin.uid ? 'Sending...' : 'Resend Email'}
                        </button>
                      )}
                      {admin.canDelete && (
                        <button type="button" className="btn" style={dangerButton} onClick={() => setToDelete(admin)}>
                          Remove {ROLES[admin.role]?.label ?? 'User'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Modal
          title={`Invite ${ROLES[newRole].label}`}
          subtitle={`They get an email from Firebase to set their password, then sign in ${newRole === 'teacher_assistant' ? 'on the study website' : 'here'}.`}
          onClose={() => !creating && setShowCreate(false)}
          width={480}
          footer={
            <>
              <button type="button" className="btn" style={ghostButton} disabled={creating} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" form="create-admin-form" className="btn" disabled={creating}>{creating ? 'Inviting...' : `Invite ${ROLES[newRole].label}`}</button>
            </>
          }
        >
          <form id="create-admin-form" noValidate onSubmit={handleCreate}>
            <span style={labelStyle}>Role</span>
            <div role="radiogroup" aria-label="Role" style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
              {ROLE_ORDER.map((role) => (
                <label
                  key={role}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: `1px solid ${newRole === role ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.1)'}`,
                    background: newRole === role ? 'rgba(255,255,255,0.06)' : 'transparent',
                  }}
                >
                  <input type="radio" name="new-role" value={role} checked={newRole === role} onChange={() => { setNewRole(role); setCreateError('') }} style={{ marginTop: '3px' }} />
                  <span>
                    <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>{ROLES[role].label}</span>
                    <span style={{ ...mutedText, display: 'block', fontSize: '0.78rem', marginTop: '2px' }}>{ROLES[role].hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <label style={labelStyle} htmlFor="new-admin-name">
              Full name{newRole === 'admin' ? ' (optional)' : ''}
            </label>
            <input id="new-admin-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Priya Sharma" maxLength={80} style={{ ...inputStyle, marginBottom: '14px' }} />

            <label style={labelStyle} htmlFor="new-admin-email">Email address</label>
            <input id="new-admin-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" style={inputStyle} />
            {createError && <p role="alert" style={{ color: '#ff8a8a', fontSize: '0.85rem', marginTop: '10px', lineHeight: 1.5 }}>{createError}</p>}
          </form>
        </Modal>
      )}

      {toDelete && (
        <Modal
          title={`Remove ${ROLES[toDelete.role]?.label ?? 'User'}`}
          onClose={() => !deleting && setToDelete(null)}
          width={480}
          footer={
            <>
              <button type="button" className="btn" style={ghostButton} disabled={deleting} onClick={() => setToDelete(null)}>Cancel</button>
              <button type="button" className="btn" style={dangerButton} disabled={deleting} onClick={handleDelete}>{deleting ? 'Removing...' : 'Remove'}</button>
            </>
          }
        >
          <p style={{ color: 'white', lineHeight: 1.6 }}>
            Remove {ROLES[toDelete.role]?.label ?? 'staff'} access for <strong style={{ wordBreak: 'break-all' }}>{toDelete.email}</strong>?
          </p>
          <p style={mutedText}>They are signed out immediately. Their account and other data are kept.</p>
        </Modal>
      )}
    </div>
  )
}

export default ManageAdmins