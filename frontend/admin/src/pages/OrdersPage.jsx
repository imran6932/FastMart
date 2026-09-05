import React, { useEffect, useState } from 'react'
import { getOrders } from '../api/index'

const STATUS_COLORS = {
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  payment_failed: 'bg-red-100 text-red-700',
  confirmed: 'bg-blue-100 text-blue-800',
  out_for_delivery: 'bg-yellow-100 text-yellow-800',
  assigned: 'bg-purple-100 text-purple-800',
  payment_pending: 'bg-orange-100 text-orange-800',
  placed: 'bg-gray-100 text-gray-700',
}

const STATUSES = ['', 'placed', 'payment_pending', 'confirmed', 'assigned', 'out_for_delivery', 'delivered', 'cancelled', 'payment_failed']

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = statusFilter ? { status: statusFilter } : {}
    getOrders(params).then(r => setOrders(r.data.results ?? r.data)).finally(() => setLoading(false))
  }, [statusFilter])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">All Orders</h1>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['ID', 'Customer', 'Status', 'Total', 'Address', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">#{o.id}</td>
                  <td className="px-4 py-3">{o.customer || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">₹{o.total_display}</td>
                  <td className="px-4 py-3 text-gray-500">{o.delivery_address_label}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="text-center text-gray-400 py-10">No orders found.</p>}
        </div>
      )}
    </div>
  )
}
