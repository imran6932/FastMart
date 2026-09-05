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

const STATUSES = [
  '',
  'placed',
  'payment_pending',
  'confirmed',
  'assigned',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'payment_failed',
]

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    setLoading(true)

    const params = statusFilter ? { status: statusFilter } : {}

    getOrders(params)
      .then((r) => setOrders(r.data.results ?? r.data))
      .finally(() => setLoading(false))
  }, [statusFilter])

  return (
    <div className="w-full">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          All Orders
        </h1>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="
            w-full sm:w-auto
            border border-gray-300
            rounded-lg
            px-3 py-2
            text-sm
            bg-white
            focus:outline-none
            focus:ring-2
            focus:ring-indigo-400
          "
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          Loading…
        </div>
      ) : (

        <div className="bg-white rounded-xl shadow overflow-hidden">

          {/* Responsive table wrapper */}
          <div className="w-full overflow-x-auto">

            <table className="w-full min-w-[900px] text-sm">

              {/* Table Header */}
              <thead className="bg-gray-50 border-b">
                <tr>
                  {[
                    'ID',
                    'Customer',
                    'Status',
                    'Total',
                    'Address',
                    'Date',
                  ].map((h) => (
                    <th
                      key={h}
                      className="
                        text-left
                        px-4
                        py-3
                        font-semibold
                        text-gray-600
                        whitespace-nowrap
                      "
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y">

                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="hover:bg-gray-50 transition"
                  >

                    {/* ID */}
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      #{o.id}
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {o.customer || '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`
                          inline-flex
                          items-center
                          px-2
                          py-0.5
                          rounded-full
                          text-xs
                          font-medium
                          ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}
                        `}
                      >
                        {o.status.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      ₹{o.total_display}
                    </td>

                    {/* Address */}
                    <td className="px-4 py-3 text-gray-500 max-w-[300px]">
                      <div
                        className="truncate"
                        title={o.delivery_address_label}
                      >
                        {o.delivery_address_label || '—'}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>

                  </tr>
                ))}

              </tbody>
            </table>

          </div>

          {/* Empty State */}
          {orders.length === 0 && (
            <p className="text-center text-gray-400 py-10">
              No orders found.
            </p>
          )}

        </div>
      )}

    </div>
  )
}
