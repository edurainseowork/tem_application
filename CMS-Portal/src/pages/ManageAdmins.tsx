import { useEffect, useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { apiFetch, ApiError } from '../api'
import Modal from '../components/Modal'
import { badgeStyle, dangerButton, formatDateTime, ghostButton, inputStyle, labelStyle, mutedText, tableStyle, tdStyle, thStyle } from './testsShared'

type AdminItem = {
  uid: string
  email: string
  name: string | null
  status: 'ACTIVE' | 'INVITED' | 'DISABLED' | 'NO_ACCOUNT'
  isSuperAdmin: boolean
  isSelf: boolean
  canDelete: boolean
  createdAt: string | null
  lastSignInAt: string | null
}

type ManageAdminsProps = {
  showToast: (message: string, type?: 'success' | 'error') => void
  // Opened from the header's "Create Admin" button
  openCreate: boolean
  onCreateOpened: () => void
}

const STATUS: Record<AdminItem['status'], { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'rgba(29,154,120,0.8)' },
  INVITED: { label: 'Invited', color: 'rgba(214,158,46,0.85)' },
  DISABLED: { label: 'Disabled', color: '#ff5e5e' },
  NO_ACCOUNT: { label: 'No account', color: 'rgba(255,255,255,0.15)' },
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Firebase sends the "set your password" email (its Password reset template)
const sendSetPasswordEmail = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email, { url: window.location.origin })
  } catch (err: any) {
    // The continue URL's domain must be authorized; retry without it
    if (err?.code === 'auth/unauthorized-continue-uri' || err?.code === 'auth/invalid-continue-uri') {
      await sendPasswordResetEmail(auth, email)
      return
    }
    throw err
  }
}

// Super Admin only. The backend (requireSuperAdmin) enforces the same rule on every request.
function ManageAdmins({ showToast, openCreate, onCreateOpened }: ManageAdminsProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [admins, setAdmins] = useState<AdminItem[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [resending, setResending] = useState<string | null>(null)

  const [toDelete, setToDelete] = useState<AdminItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    try {
      const res = await apiFetch<{ data: AdminItem[] }>('/cms/admins')
      setAdmins(res.data)
      setLoadError('')
    } catch (e: any) {
      setLoadError(e instanceof ApiError && e.status === 403 ? e.message : 'Failed to load admins: ' + e.message)
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

  const openCreateModal = () => {
    setNewEmail('')
    setCreateError('')
    setShowCreate(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email) return setCreateError('Email is required')
    if (!EMAIL_PATTERN.test(email)) return setCreateError('Enter a valid email address')

    setCreateError('')
    setCreating(true)
    try {
      await apiFetch('/cms/admins', { method: 'POST', body: { email } })
      try {
        await sendSetPasswordEmail(email)
        showToast(`${email} is now an admin. A "set your password" email was sent.`, 'success')
      } catch (err: any) {
        showToast(`${email} is now an admin, but the email could not be sent (${err?.code || err?.message}). Use "Resend Email".`, 'error')
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
      await sendSetPasswordEmail(admin.email)
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
      showToast(`${toDelete.email} is no longer an admin`, 'success')
      setToDelete(null)
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="glass-card"><p style={mutedText}>Loading admins...</p></div>
  }

  if (loadError) {
    return (
      <div className="glass-card">
        <p role="alert" style={{ color: '#ff8a8a', marginBottom: 'var(--space-md)' }}>{loadError}</p>
        <button type="button" className="btn" onClick={() => { setLoading(true); load() }}>Retry</button>
      </div>
    )
  }

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
        <div>
          <h3>Admins ({admins.length})</h3>
          <p style={{ ...mutedText, marginTop: '4px' }}>Every admin has the same CMS access. Only you can add or remove admins.</p>
        </div>
        <button type="button" className="btn" onClick={openCreateModal}>+ Create Admin</button>
      </div>

      {admins.length === 0 ? (
        <p style={mutedText}>No admins yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Last sign-in</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.uid}>
                  <td style={tdStyle}>
                    <div style={{ wordBreak: 'break-all' }}>{admin.email}</div>
                    {admin.name && <div style={{ ...mutedText, fontSize: '0.75rem' }}>{admin.name}</div>}
                    {admin.isSuperAdmin && <span style={{ ...badgeStyle, background: 'rgba(79,70,229,0.8)', marginTop: '4px' }}>Super Admin{admin.isSelf ? ' (you)' : ''}</span>}
                  </td>
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
                        <button type="button" className="btn" style={dangerButton} onClick={() => setToDelete(admin)}>Delete Admin</button>
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
          title="Create Admin"
          subtitle="They get an email from Firebase to set their password, then sign in here."
          onClose={() => !creating && setShowCreate(false)}
          width={480}
          footer={
            <>
              <button type="button" className="btn" style={ghostButton} disabled={creating} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" form="create-admin-form" className="btn" disabled={creating}>{creating ? 'Creating...' : 'Create Admin'}</button>
            </>
          }
        >
          <form id="create-admin-form" noValidate onSubmit={handleCreate}>
            <label style={labelStyle} htmlFor="new-admin-email">Email address</label>
            <input id="new-admin-email" type="email" autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" style={inputStyle} />
            {createError && <p role="alert" style={{ color: '#ff8a8a', fontSize: '0.85rem', marginTop: '10px', lineHeight: 1.5 }}>{createError}</p>}
          </form>
        </Modal>
      )}

      {toDelete && (
        <Modal
          title="Delete Admin"
          onClose={() => !deleting && setToDelete(null)}
          width={480}
          footer={
            <>
              <button type="button" className="btn" style={ghostButton} disabled={deleting} onClick={() => setToDelete(null)}>Cancel</button>
              <button type="button" className="btn" style={dangerButton} disabled={deleting} onClick={handleDelete}>{deleting ? 'Deleting...' : 'Delete Admin'}</button>
            </>
          }
        >
          <p style={{ color: 'white', lineHeight: 1.6 }}>
            Remove CMS access for <strong style={{ wordBreak: 'break-all' }}>{toDelete.email}</strong>?
          </p>
          <p style={mutedText}>They are signed out of the CMS immediately. Their account and other data are kept.</p>
        </Modal>
      )}
    </div>
  )
}

export default ManageAdmins