import { useEffect, useMemo, useState } from 'react'
import {
  apiFetch,
  uploadFile,
  formatINR,
  paiseToRupees,
  rupeesToPaise,
  MAX_UPLOAD_BYTES,
  type AdminCourse,
  type Category,
} from '../api'

const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' };

const ALLOWED_THUMBNAIL_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type Props = {
  courses: AdminCourse[];
  reloadCourses: () => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error') => void;
};

type FormState = {
  title: string;
  description: string;
  price: string;
  originalPrice: string;
  categoryId: string;
  publishNow: boolean;
};

const emptyForm: FormState = { title: '', description: '', price: '', originalPrice: '', categoryId: '', publishNow: false };

export default function CourseManager({ courses, reloadCourses, showToast }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<AdminCourse | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyCourseId, setBusyCourseId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ data: Category[] }>('/admin/categories')
      .then((res) => setCategories(res.data))
      .catch((e) => showToast('Failed to load categories: ' + e.message, 'error'));
  }, []);

  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailPreview(null);
      return;
    }
    const url = URL.createObjectURL(thumbnailFile);
    setThumbnailPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnailFile]);

  const visibleCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) =>
      (statusFilter === 'all' || (statusFilter === 'published') === c.isPublished) &&
      (!categoryFilter || String(c.categoryId) === categoryFilter) &&
      (!q || `${c.title} ${c.description}`.toLowerCase().includes(q)),
    );
  }, [courses, statusFilter, categoryFilter, search]);

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm);
    setThumbnailFile(null);
  };

  const startEdit = (course: AdminCourse) => {
    setEditing(course);
    setForm({
      title: course.title,
      description: course.description,
      price: paiseToRupees(course.price),
      originalPrice: course.originalPrice != null ? paiseToRupees(course.originalPrice) : '',
      categoryId: course.categoryId ? String(course.categoryId) : '',
      publishNow: course.isPublished,
    });
    setThumbnailFile(null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const pickThumbnail = (file: File | null) => {
    if (file && !ALLOWED_THUMBNAIL_TYPES.includes(file.type)) {
      showToast('Thumbnail must be a PNG, JPEG or WEBP image', 'error');
      return;
    }
    if (file && file.size > MAX_UPLOAD_BYTES) {
      showToast('Thumbnail must be 500 KB or smaller', 'error');
      return;
    }
    setThumbnailFile(file);
  };

  const validate = (): string | null => {
    if (form.title.trim().length < 3) return 'Title must be at least 3 characters';
    if (form.description.trim().length < 10) return 'Description must be at least 10 characters';
    if (!form.categoryId) return 'Please choose a category';
    const price = Number(form.price);
    if (form.price === '' || !Number.isFinite(price) || price < 0) return 'Enter a valid price';
    if (form.originalPrice !== '') {
      const mrp = Number(form.originalPrice);
      if (!Number.isFinite(mrp) || mrp < price) return 'Original price must be greater than or equal to the price';
    }
    if (!editing && !thumbnailFile) return 'Please select a thumbnail';
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      showToast(error, 'error');
      return;
    }
    setIsSaving(true);
    try {
      const thumbnail = thumbnailFile ? await uploadFile(thumbnailFile) : undefined;
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: rupeesToPaise(form.price),
        originalPrice: form.originalPrice === '' ? null : rupeesToPaise(form.originalPrice),
        categoryId: Number(form.categoryId),
        ...(thumbnail ? { thumbnail } : {}),
      };

      if (editing) {
        await apiFetch(`/admin/courses/${editing.id}`, { method: 'PATCH', body: payload });
        showToast('Course updated', 'success');
      } else {
        await apiFetch('/admin/courses', { method: 'POST', body: { ...payload, isPublished: form.publishNow } });
        showToast(form.publishNow ? 'Course published!' : 'Course saved as draft', 'success');
      }
      resetForm();
      await reloadCourses();
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublish = async (course: AdminCourse) => {
    setBusyCourseId(course.id);
    try {
      await apiFetch(`/admin/courses/${course.id}/publish`, { method: 'PATCH', body: { isPublished: !course.isPublished } });
      showToast(course.isPublished ? 'Course unpublished' : 'Course published', 'success');
      await reloadCourses();
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setBusyCourseId(null);
    }
  };

  const handleDelete = async (course: AdminCourse) => {
    if (!window.confirm(`Delete "${course.title}" permanently? All of its content will be removed too.`)) return;
    setBusyCourseId(course.id);
    try {
      await apiFetch(`/admin/courses/${course.id}`, { method: 'DELETE' });
      showToast('Course deleted', 'success');
      if (editing?.id === course.id) resetForm();
      await reloadCourses();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusyCourseId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

      {/* Existing Courses List */}
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Existing Courses ({courses.length})</h3>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search courses..." style={{ ...inputStyle, flex: 2, minWidth: '180px', width: 'auto' }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} style={{ ...inputStyle, flex: 1, minWidth: '140px', width: 'auto' }}>
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '140px', width: 'auto' }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {visibleCourses.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No courses found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {visibleCourses.map((course) => (
              <div key={course.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <img src={course.thumbnail} alt="" style={{ width: '96px', height: '54px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h4 style={{ color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.title}</h4>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '999px', background: course.isPublished ? 'var(--mint)' : 'rgba(255,255,255,0.15)', color: course.isPublished ? 'var(--navy)' : 'white' }}>
                      {course.isPublished ? 'PUBLISHED' : 'DRAFT'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {formatINR(course.price)}
                    {course.originalPrice != null && course.originalPrice > course.price && <s style={{ marginLeft: '6px' }}>{formatINR(course.originalPrice)}</s>}
                    {' • '}{course.category} • {course.enrollmentCount} enrolled
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => togglePublish(course)} disabled={busyCourseId === course.id} className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', fontSize: '0.8rem' }}>
                    {course.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button onClick={() => startEdit(course)} disabled={busyCourseId === course.id} className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Edit</button>
                  <button
                    onClick={() => handleDelete(course)}
                    disabled={busyCourseId === course.id || course.enrollmentCount > 0}
                    title={course.enrollmentCount > 0 ? 'Courses with enrolled students cannot be deleted — unpublish instead' : undefined}
                    className="btn"
                    style={{ background: '#ff5e5e', border: 'none', padding: '6px 12px', fontSize: '0.8rem', opacity: course.enrollmentCount > 0 ? 0.5 : 1 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Course Form */}
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>{editing ? `Edit Course: ${editing.title}` : 'Create New Course'}</h3>
        {categories.length === 0 && (
          <p style={{ color: '#ffb35e', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>No categories yet — add one in the Categories tab first.</p>
        )}
        <form onSubmit={e => { e.preventDefault(); handleSave(); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div>
            <label style={labelStyle}>Course Title</label>
            <input type="text" value={form.title} maxLength={150} onChange={e => update({ title: e.target.value })} placeholder="e.g. Advanced Mechanics" className="input-field" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select value={form.categoryId} onChange={e => update({ categoryId: e.target.value })} className="input-field" style={inputStyle}>
              <option value="">Select category...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea rows={5} value={form.description} maxLength={5000} onChange={e => update({ description: e.target.value })} placeholder="What students will learn, who it is for, what is included..." className="input-field" style={inputStyle} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'right' }}>{form.description.length}/5000</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Selling Price (INR)</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => update({ price: e.target.value })} placeholder="999" className="input-field" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Original Price / MRP (optional)</label>
              <input type="number" min="0" step="0.01" value={form.originalPrice} onChange={e => update({ originalPrice: e.target.value })} placeholder="1499" className="input-field" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>{editing ? 'Replace Thumbnail (optional)' : 'Upload Thumbnail (From PC)'}</label>
            <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
              <input type="file" accept="image/png, image/jpeg, image/webp" onChange={e => pickThumbnail(e.target.files?.[0] || null)} className="input-field" style={{ ...inputStyle, padding: '9px', cursor: 'pointer', flex: 1 }} />
              {(thumbnailPreview || editing?.thumbnail) && (
                <img src={thumbnailPreview || editing!.thumbnail} alt="Thumbnail preview" style={{ width: '128px', height: '72px', objectFit: 'cover', borderRadius: '6px' }} />
              )}
            </div>
            <p style={{ fontSize: '0.75rem', color: '#ff5e5e', marginTop: '6px' }}>
              * Max size: 500 KB. Recommended: 1280x720 px (16:9) to prevent UI breaking.
            </p>
          </div>
          {!editing && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.publishNow} onChange={e => update({ publishNow: e.target.checked })} />
              Publish immediately (otherwise saved as a draft, hidden from the app)
            </label>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="submit" disabled={isSaving} className="btn" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-sm)' }}>
              {isSaving ? 'Saving...' : editing ? 'Save Changes' : form.publishNow ? 'Publish Course' : 'Save Draft'}
            </button>
            {editing && (
              <button type="button" onClick={resetForm} className="btn" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-sm)', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
