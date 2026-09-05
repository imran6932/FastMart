import React, { useEffect, useState } from 'react'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../api/index'

const EMPTY = { name: '', slug: '', image: null }

export default function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [imagePreview, setImagePreview] = useState(null)

  const fetchAll = () => {
    setLoading(true)
    getCategories()
      .then(r => setCategories(r.data.results ?? r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [])

  const openCreate = () => {
    setForm(EMPTY)
    setImagePreview(null)
    setEditId(null)
    setShowForm(true)
    setError('')
  }

  const openEdit = (c) => {
    setForm({
      name: c.name,
      slug: c.slug,
      image: null
    })
    setImagePreview(c.image || null)
    setEditId(c.id)
    setShowForm(true)
    setError('')
  }

  const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setForm(f => ({ ...f, image: file }))
      const reader = new FileReader()
      reader.onload = (evt) => setImagePreview(evt.target?.result)
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('slug', form.slug || toSlug(form.name))
      if (form.image) fd.append('image', form.image)

      if (editId) await updateCategory(editId, fd)
      else await createCategory(fd)

      setShowForm(false)
      fetchAll()
    } catch (err) {
      const d = err.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this category?')) return
    await deleteCategory(id)
    fetchAll()
  }

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Categories</h1>
        <button onClick={openCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium">
          + New Category
        </button>
      </div>

      <input type="text" placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400" />

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map(c => (
            <div key={c.id} className="bg-white rounded-lg shadow hover:shadow-md transition overflow-hidden">
              {c.image && (
                <img src={c.image} alt={c.name} className="w-full h-60 object-cover" />
              )}
              <div className="p-4 flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{c.name}</h3>
                  <p className="text-gray-500 text-sm font-mono">{c.slug}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(c)} className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded text-sm font-medium transition">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:bg-red-50 px-3 py-2 rounded text-sm font-medium transition">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-bold text-lg mb-4">{editId ? 'Edit Category' : 'New Category'}</h2>
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-3">{error}</div>}
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input required placeholder="e.g. Dairy" value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value, slug: toSlug(e.target.value) }))}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Slug <span className="text-gray-400 font-normal">(auto-filled)</span></label>
                <input required placeholder="e.g. dairy" value={form.slug}
                  onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Image</label>
                {imagePreview && (
                  <div className="mb-3 relative">
                    <img src={imagePreview} alt="preview" className="w-full h-32 object-cover rounded" />
                    <button type="button" onClick={() => { setForm(f => ({ ...f, image: null })); setImagePreview(null) }}
                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded hover:bg-red-600 text-xs">
                      Remove
                    </button>
                  </div>
                )}
                <label className="w-full border-2 border-dashed rounded-lg px-3 py-4 text-center cursor-pointer hover:bg-gray-50 transition">
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  <p className="text-sm text-gray-600">
                    {imagePreview ? 'Click to change image' : 'Click to upload image'}
                  </p>
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition text-sm">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50 transition">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
