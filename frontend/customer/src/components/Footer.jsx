import React from 'react'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white mt-16">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <h3 className="text-xl font-bold mb-4 text-blue-400">FastMart</h3>
            <p className="text-gray-400 text-sm">Your trusted online grocery and essentials store.</p>
            <div className="flex gap-3 mt-4">
              <a href="#" className="text-gray-400 hover:text-blue-400 transition">📘</a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition">🐦</a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition">📷</a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="/" className="hover:text-blue-400 transition">Home</a></li>
              <li><a href="#" className="hover:text-blue-400 transition">About Us</a></li>
              <li><a href="#" className="hover:text-blue-400 transition">Categories</a></li>
              <li><a href="#" className="hover:text-blue-400 transition">Offers</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#" className="hover:text-blue-400 transition">Contact Us</a></li>
              <li><a href="#" className="hover:text-blue-400 transition">FAQ</a></li>
              <li><a href="#" className="hover:text-blue-400 transition">Returns</a></li>
              <li><a href="#" className="hover:text-blue-400 transition">Shipping Info</a></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="font-semibold mb-4">Newsletter</h4>
            <p className="text-sm text-gray-400 mb-3">Subscribe for exclusive offers</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Your email"
                className="flex-1 px-3 py-2 rounded bg-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium transition">
                Subscribe
              </button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 pt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-400">
            <div>
              <p>&copy; 2024 FastMart. All rights reserved.</p>
            </div>
            <div className="flex gap-4 justify-start md:justify-end">
              <a href="#" className="hover:text-blue-400 transition">Privacy Policy</a>
              <a href="#" className="hover:text-blue-400 transition">Terms & Conditions</a>
              <a href="#" className="hover:text-blue-400 transition">Cookie Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
