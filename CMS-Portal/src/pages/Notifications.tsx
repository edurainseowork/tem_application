import { useEffect, useState } from 'react'
import { AdminNotificationBody, NOTIFICATION_IMAGE_MAX_BYTES } from '@workspace/api-zod'
import { apiFetch } from '../api'

type AdminNotification = {
  id: number
  title: string
  body: string
  imageUrl: string | null
  sentBy: string | null
  recipientCount: number
  pushSentCount: number
  pushFailedCount: number
  createdAt: string
}

type NotificationsProps = {
  showToast: (message: string, type?: 'success' | 'error') => void
}

const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' } as const
const labelStyle = { display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' } as const
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function Notifications({ showToast }: NotificationsProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [history, setHistory] = useState<AdminNotification[]>([])

  const fetchHistory = async () => {
    try {
      const data = await apiFetch<{ data: AdminNotification[] }>('/admin/notifications')
      setHistory(data.data)
    } catch (e: any) {
      showToast('Failed to load notifications: ' + e.message, 'error')
    }
  }

  // Load the history once when the tab opens
  useEffect(() => {
    fetchHistory()
  }, [])

  const handleImage = (file: File | null) => {
    if (file && !IMAGE_TYPES.includes(file.type)) {
      showToast('Image must be a PNG, JPEG or WEBP file', 'error')
      return
    }
    if (file && file.size > NOTIFICATION_IMAGE_MAX_BYTES) {
      showToast('Image must be 1 MB or smaller', 'error')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setPreview(file ? URL.createObjectURL(file) : null)
    setImage(file)
  }

  const handleSend = async () => {
    const parsed = AdminNotificationBody.safeParse({ title, description })
    if (!parsed.success) {
      showToast(parsed.error.issues[0]?.message || 'Please check the notification details', 'error')
      return
    }
    if (!window.confirm(`Send "${parsed.data.title}" to ALL registered users now? This cannot be undone.`)) return

    setIsSending(true)
    try {
      const formData = new FormData()
      formData.append('title', parsed.data.title)
      formData.append('description', parsed.data.description)
      if (image) formData.append('image', image)

      const data = await apiFetch<{ data: AdminNotification; devices: number }>('/admin/notifications', { method: 'POST', formData })
      showToast(`Notification Sent to ${data.data.recipientCount} users`, 'success')
      setTitle('')
      setDescription('')
      handleImage(null)
      fetchHistory()
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="glass-card">
        <h3 style={{ marginBottom: '8px' }}>Send Notification</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>
          Goes to every registered user as a push notification (even if the app is closed) and is saved in their in-app notification history.
        </p>
        <form noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }} onSubmit={(e) => { e.preventDefault(); handleSend() }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="e.g. New batch starting Monday" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description ({description.length}/500)</label>
            <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="What do you want to tell your students?" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Thumbnail / Image (optional, PNG/JPEG/WEBP, max 1 MB)</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => handleImage(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: '9px', cursor: 'pointer' }} />
            {preview && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <img src={preview} alt="Preview" style={{ width: '240px', maxHeight: '135px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                <button type="button" onClick={() => handleImage(null)} className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', fontSize: '0.8rem' }}>Remove</button>
              </div>
            )}
          </div>
          <button type="submit" disabled={isSending} className="btn" style={{ alignSelf: 'flex-start' }}>
            {isSending ? 'Sending...' : 'Send Notification'}
          </button>
        </form>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Sent Notifications</h3>
        {history.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No notifications sent yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {history.map((item) => (
              <div key={item.id} style={{ display: 'flex', gap: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {item.imageUrl && <img src={item.imageUrl} alt="" style={{ width: '96px', height: '54px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ color: 'white', marginBottom: '4px' }}>{item.title}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{item.body}</p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {new Date(item.createdAt).toLocaleString()} · {item.recipientCount} users · {item.pushSentCount} pushed
                    {item.pushFailedCount > 0 ? ` · ${item.pushFailedCount} failed` : ''}
                    {item.sentBy ? ` · by ${item.sentBy}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Notifications
