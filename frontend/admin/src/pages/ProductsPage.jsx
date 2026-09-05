import React, { useEffect, useState } from 'react'
import { getProducts, getCategories, createProduct, updateProduct, deleteProduct, createCategory } from '../api/index'

const EMPTY = { name: '', description: '', price: '', stock: '', category_id: '', is_available: true, image: null }
const EMPTY_CAT = { name: '', slug: '', image: null }

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  // Category modal state
  const [showCatForm, setShowCatForm] = useState(false)
  const [catForm, setCatForm] = useState(EMPTY_CAT)
  const [catImagePreview, setCatImagePreview] = useState(null)
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchAll = () => {
    setLoading(true)
    Promise.all([getProducts({ search }), getCategories()])
      .then(([p, c]) => { setProducts(p.data.results ?? p.data); setCategories(c.data.results ?? c.data) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [search])

  const openCreate = () => { setForm(EMPTY); setImagePreview(null); setEditId(null); setShowForm(true); setError('') }
  const openEdit = (p) => {
    setForm({ name: p.name, description: p.description, price: p.price, stock: p.stock, category_id: p.category?.id || '', is_available: p.is_available, image: null })
    setImagePreview(p.image || null)
    setEditId(p.id); setShowForm(true); setError('')
  }

  // Auto-generate slug from name
  const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const handleCatSave = async (e) => {
    e.preventDefault(); setCatError(''); setCatSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', catForm.name)
      fd.append('slug', catForm.slug || toSlug(catForm.name))
      if (catForm.image) fd.append('image', catForm.image)
      await createCategory(fd)
      setShowCatForm(false); setCatForm(EMPTY_CAT); setCatImagePreview(null); fetchAll()
    } catch (err) {
      const d = err.response?.data
      setCatError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Could not save category.')
    } finally { setCatSaving(false) }
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null) fd.append(k, v) })
      if (editId) await updateProduct(editId, fd)
      else await createProduct(fd)
      setShowForm(false); fetchAll()
    } catch (err) {
      const d = err.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Save failed.')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return
    await deleteProduct(id); fetchAll()
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setForm(f => ({ ...f, image: file }))
      const reader = new FileReader()
      reader.onload = (evt) => setImagePreview(evt.target?.result)
      reader.readAsDataURL(file)
    }
  }

  const handleCatImageChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setCatForm(f => ({ ...f, image: file }))
      const reader = new FileReader()
      reader.onload = (evt) => setCatImagePreview(evt.target?.result)
      reader.readAsDataURL(file)
    }
  }

  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowCatForm(true); setCatForm(EMPTY_CAT); setCatError('') }}
            className="border border-indigo-400 text-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-50 transition text-sm font-medium">
            + New Category
          </button>
          <button onClick={openCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium">
            + New Product
          </button>
        </div>
      </div>

      <input type="text" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400" />

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <div key={p.id} className="bg-white rounded-lg shadow hover:shadow-md transition overflow-hidden">
              {p.image && (
                <img src={p.image} alt={p.name} className="w-full h-60 object-cover" />
              )}
              <div className="p-3">
                <h3 className="font-semibold text-sm mb-2 line-clamp-1">{p.name}</h3>
                <div className="space-y-1 text-xs mb-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Category:</span>
                    <span className="text-gray-800 font-medium">{p.category?.name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price:</span>
                    <span className="text-indigo-600 font-semibold">₹{p.price_display}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stock:</span>
                    <span className="text-gray-800 font-medium">{p.stock}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Available:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                      {p.is_available ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(p)} className="flex-1 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-2 py-1.5 rounded text-xs font-medium transition">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="flex-1 border border-red-500 text-red-500 hover:bg-red-50 px-2 py-1.5 rounded text-xs font-medium transition">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit drawer */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-bold text-lg mb-4">{editId ? 'Edit Product' : 'New Product'}</h2>
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-3">{error}</div>}
            <form onSubmit={handleSave} className="space-y-3">
              <input required placeholder="Name" value={form.name} onChange={set('name')}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <textarea placeholder="Description" value={form.description} onChange={set('description')} rows={2}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <div className="grid grid-cols-2 gap-3">
                <input required type="number" placeholder="Price (rupees)" value={form.price} onChange={set('price')}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <input required type="number" placeholder="Stock" value={form.stock} onChange={set('stock')}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <select required value={form.category_id} onChange={set('category_id')}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">Select category…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_available} onChange={set('is_available')} />
                Available for purchase
              </label>
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

      {/* Add Category modal */}
      {showCatForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="font-bold text-lg mb-4">New Category</h2>
            {catError && <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-3">{catError}</div>}
            <form onSubmit={handleCatSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input required placeholder="e.g. Dairy" value={catForm.name}
                  onChange={(e) => setCatForm(f => ({ ...f, name: e.target.value, slug: toSlug(e.target.value) }))}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Slug <span className="text-gray-400 font-normal">(auto-filled)</span></label>
                <input required placeholder="e.g. dairy" value={catForm.slug}
                  onChange={(e) => setCatForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Image</label>
                {catImagePreview && (
                  <div className="mb-3 relative">
                    <img src={catImagePreview} alt="preview" className="w-full h-32 object-cover rounded" />
                    <button type="button" onClick={() => { setCatForm(f => ({ ...f, image: null })); setCatImagePreview(null) }}
                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded hover:bg-red-600 text-xs">
                      Remove
                    </button>
                  </div>
                )}
                <label className="w-full border-2 border-dashed rounded-lg px-3 py-4 text-center cursor-pointer hover:bg-gray-50 transition">
                  <input type="file" accept="image/*" onChange={handleCatImageChange} className="hidden" />
                  <p className="text-sm text-gray-600">
                    {catImagePreview ? 'Click to change image' : 'Click to upload image'}
                  </p>
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={catSaving}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition text-sm">
                  {catSaving ? 'Saving…' : 'Save Category'}
                </button>
                <button type="button" onClick={() => setShowCatForm(false)}
                  className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50 transition">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
