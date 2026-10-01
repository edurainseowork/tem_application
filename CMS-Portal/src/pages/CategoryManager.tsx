import { useEffect, useState } from 'react'
import { apiFetch, type Category } from '../api'

const inputStyle: React.CSSProperties = { padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' };

type Props = {
  showToast: (message: string, type?: 'success' | 'error') => void;
  onCategoriesChanged: () => void;
};

export default function CategoryManager({ showToast, onCategoriesChanged }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editSortOrder, setEditSortOrder] = useState('0');

  const fetchCategories = async () => {
    try {
      const res = await apiFetch<{ data: Category[] }>('/admin/categories');
      setCategories(res.data);
    } catch (e: any) {
      showToast('Failed to load categories: ' + e.message, 'error');
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      showToast('Category name must be at least 2 characters', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await apiFetch('/admin/categories', { method: 'POST', body: { name: name.trim(), sortOrder: Number(sortOrder) || 0 } });
      showToast(`Category "${name.trim()}" added`, 'success');
      setName('');
      setSortOrder('0');
      await fetchCategories();
      onCategoriesChanged();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditSortOrder(String(category.sortOrder));
  };

  const handleUpdate = async (id: number) => {
    try {
      await apiFetch(`/admin/categories/${id}`, { method: 'PATCH', body: { name: editName.trim(), sortOrder: Number(editSortOrder) || 0 } });
      showToast('Category updated', 'success');
      setEditingId(null);
      await fetchCategories();
      onCategoriesChanged();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleDelete = async (category: Category) => {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    try {
      await apiFetch(`/admin/categories/${category.id}`, { method: 'DELETE' });
      showToast('Category deleted', 'success');
      await fetchCategories();
      onCategoriesChanged();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Categories ({categories.length})</h3>
        {categories.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No categories yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {categories.map((category) => (
              <div key={category.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {editingId === category.id ? (
                  <>
                    <input type="text" value={editName} maxLength={50} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
                    <input type="number" min="0" value={editSortOrder} onChange={e => setEditSortOrder(e.target.value)} title="Sort order" style={{ ...inputStyle, width: '90px' }} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => handleUpdate(category.id)} className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Save</button>
                      <button onClick={() => setEditingId(null)} className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', fontSize: '0.8rem' }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <h4 style={{ color: 'white', marginBottom: '4px' }}>{category.name}</h4>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        /{category.slug} • order {category.sortOrder} • {category.courseCount} course(s)
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => startEdit(category)} className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Edit</button>
                      <button
                        onClick={() => handleDelete(category)}
                        disabled={category.courseCount > 0}
                        title={category.courseCount > 0 ? 'Move or delete its courses first' : undefined}
                        className="btn"
                        style={{ background: '#ff5e5e', border: 'none', padding: '6px 12px', fontSize: '0.8rem', opacity: category.courseCount > 0 ? 0.5 : 1 }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Add Category</h3>
        <form onSubmit={e => { e.preventDefault(); handleCreate(); }} style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Name</label>
            <input type="text" value={name} maxLength={50} onChange={e => setName(e.target.value)} placeholder="e.g. JEE Advanced" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Sort order</label>
            <input type="number" min="0" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <button type="submit" disabled={isSaving} className="btn">{isSaving ? 'Adding...' : 'Add Category'}</button>
        </form>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 'var(--space-md)' }}>
          Categories appear as filter pills in the mobile app, lowest sort order first.
        </p>
      </div>
    </div>
  );
}
