import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRiders } from '../api/index'

// Rider list — lets the admin pick any rider to view their live location and,
// if they're currently out for delivery, the live route to their customer.

export default function RidersPage() {
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRiders = () =>
      getRiders()
        .then((r) => setRiders(r.data))
        .finally(() => setLoading(false))

    fetchRiders()

    const interval = setInterval(fetchRiders, 10000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-400">
        Loading riders…
      </div>
    )
  }

  return (
    <div className="w-full">

      {/* Page Header */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Riders
        </h1>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl shadow overflow-hidden">

        {/* Responsive horizontal scroll */}
        <div className="w-full overflow-x-auto">

          <table className="w-full min-w-[750px] text-sm">

            {/* Table Header */}
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 whitespace-nowrap">
                  Rider
                </th>

                <th className="text-left px-4 py-3 whitespace-nowrap">
                  Warehouse
                </th>

                <th className="text-left px-4 py-3 whitespace-nowrap">
                  Status
                </th>

                <th className="text-left px-4 py-3 whitespace-nowrap">
                  Active Order
                </th>

                <th className="text-right px-4 py-3 whitespace-nowrap">
                  Action
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y">

              {riders.map((rider) => (
                <tr
                  key={rider.rider_id}
                  className="hover:bg-gray-50 transition"
                >

                  {/* Rider */}
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {rider.email}
                  </td>

                  {/* Warehouse */}
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {rider.warehouse?.name ?? '—'}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`
                        inline-flex
                        items-center
                        text-xs
                        px-2
                        py-0.5
                        rounded-full
                        font-medium
                        ${
                          rider.is_on_duty
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }
                      `}
                    >
                      {rider.is_on_duty ? 'On Duty' : 'Off Duty'}
                    </span>
                  </td>

                  {/* Active Order */}
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {rider.active_order_id
                      ? `Order #${rider.active_order_id}`
                      : '—'}
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      to={`/riders/${rider.rider_id}/track`}
                      className="
                        inline-flex
                        items-center
                        justify-center
                        px-3
                        py-1.5
                        bg-indigo-600
                        hover:bg-indigo-700
                        active:bg-indigo-800
                        text-white
                        rounded-lg
                        text-xs
                        font-medium
                        transition
                      "
                    >
                      🗺 Track
                    </Link>
                  </td>

                </tr>
              ))}

              {/* Empty State */}
              {riders.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No riders found.
                  </td>
                </tr>
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  )
}