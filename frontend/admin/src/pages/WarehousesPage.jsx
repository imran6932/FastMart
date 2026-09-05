import React, { useEffect, useState } from 'react'
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from '../api/index'

const EMPTY = {
  name: '',
  city: '',
  state: '',
  pincode: '',
  latitude: '',
  longitude: '',
  is_active: true,
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchAll = () => {
    setLoading(true)
    getWarehouses()
      .then(r => setWarehouses(r.data.results ?? r.data))
      .catch(e => {
        console.error('Failed to fetch warehouses:', e)
        setError('Failed to fetch warehouses')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [])

  const openCreate = () => {
    setForm(EMPTY)
    setEditId(null)
    setShowForm(true)
    setError('')
  }

  const openEdit = (w) => {
    setForm({
      name: w.name,
      city: w.city,
      state: w.state,
      pincode: w.pincode,
      latitude: w.location?.coordinates[1] || '',
      longitude: w.location?.coordinates[0] || '',
      is_active: w.is_active,
    })
    setEditId(w.id)
    setShowForm(true)
    setError('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    // Validation
    if (!form.name || !form.city || !form.state || !form.pincode || !form.latitude || !form.longitude) {
      setError('All fields are required')
      setSaving(false)
      return
    }

    try {
      const data = {
        name: form.name,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        is_active: form.is_active,
      }

      if (editId) {
        await updateWarehouse(editId, data)
      } else {
        await createWarehouse(data)
      }

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
    if (!window.confirm('Are you sure you want to delete this warehouse?')) return
    try {
      await deleteWarehouse(id)
      fetchAll()
    } catch (err) {
      setError('Delete failed')
    }
  }

  const filtered = warehouses.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.city.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="text-center py-16 text-gray-400">Loading warehouses...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Warehouses</h1>
        <button onClick={openCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium">
          + Add Warehouse
        </button>
      </div>

      <input
        type="text"
        placeholder="Search by name or city..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(w => (
          <div key={w.id} className="bg-white rounded-lg shadow hover:shadow-md transition overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-base mb-1">{w.name}</h3>
                  <p className="text-sm text-gray-600">{w.city}, {w.state} {w.pincode}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${w.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                  {w.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <div className="p-4 bg-gray-50 space-y-2 text-sm">
              <p><span className="text-gray-600">🚴 Riders:</span> <span className="font-medium text-gray-800">{w.riders_count || 0} total ({w.on_duty_riders_count || 0} on-duty)</span></p>
            </div>
            <div className="p-3 flex gap-2">
              <button onClick={() => openEdit(w)} className="flex-1 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded text-xs font-medium transition">
                Edit
              </button>
              <button onClick={() => handleDelete(w.id)} className="flex-1 border border-red-500 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded text-xs font-medium transition">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
            <h2 className="font-bold text-lg mb-4">{editId ? 'Edit Warehouse' : 'Create Warehouse'}</h2>
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded mb-3">{error}</div>}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Warehouse name"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="City"
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    placeholder="State"
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pincode *</label>
                  <input
                    type="text"
                    required
                    value={form.pincode}
                    onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                    placeholder="Pincode"
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude *</label>
                  <input
                    type="number"
                    required
                    step="0.000001"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    placeholder="Latitude"
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude *</label>
                  <input
                    type="number"
                    required
                    step="0.000001"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    placeholder="Longitude"
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">Active</label>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t">
                <button type="button" className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium transition" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition disabled:opacity-50" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
