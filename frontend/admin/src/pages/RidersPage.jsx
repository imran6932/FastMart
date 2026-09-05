import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRiders } from '../api/index'

// Rider list — lets the admin pick any rider to view their live location and,
// if they're currently out for delivery, the live route to their customer.
export default function RidersPage() {
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRiders = () => getRiders().then(r => setRiders(r.data)).finally(() => setLoading(false))
    fetchRiders()
    const interval = setInterval(fetchRiders, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="text-center py-16 text-gray-400">Loading riders…</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Riders</h1>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Rider</th>
              <th className="text-left px-4 py-3">Warehouse</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Active Order</th>
              <th className="text-right px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {riders.map(rider => (
              <tr key={rider.rider_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{rider.email}</td>
                <td className="px-4 py-3 text-gray-600">{rider.warehouse?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    rider.is_on_duty ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rider.is_on_duty ? 'On Duty' : 'Off Duty'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {rider.active_order_id ? `Order #${rider.active_order_id}` : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/riders/${rider.rider_id}/track`}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition"
                  >
                    🗺 Track
                  </Link>
                </td>
              </tr>
            ))}
            {riders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No riders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
