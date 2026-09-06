import React, { useEffect, useState } from 'react'

import { getCategories, getProducts } from '../api/products'
import ProductCard from '../components/ProductCard'
import { useServiceLocation } from '../contexts/LocationContext'


export default function HomePage() {
  const { cartEnabled } = useServiceLocation() || {}

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState(null)


  const banners = [
    {
      gradient: 'from-blue-600 to-cyan-500',
      title: 'Fresh Groceries',
      subtitle: 'Delivered to your door',
      icon: '🥬',
    },
    {
      gradient: 'from-purple-600 to-pink-500',
      title: 'Daily Essentials',
      subtitle: 'All you need, everyday',
      icon: '🛍️',
    },
    {
      gradient: 'from-green-600 to-emerald-500',
      title: 'Best Quality',
      subtitle: 'Premium products guaranteed',
      icon: '✨',
    },
    {
      gradient: 'from-orange-600 to-red-500',
      title: 'Fast Delivery',
      subtitle: 'Same day delivery available',
      icon: '🚚',
    },
  ]


  // Load categories
  useEffect(() => {
    getCategories().then((r) =>
      setCategories(
        r.data.results ?? r.data
      )
    )
  }, [])


  // Load products
  useEffect(() => {
    setLoading(true)

    getProducts({})
      .then((r) =>
        setProducts(
          r.data.results ?? r.data
        )
      )
      .finally(() => setLoading(false))
  }, [])


  // Category filter
  const handleCategoryClick = (category) => {
    setLoading(true)
    setSelectedCategory(category)

    getProducts({
      category: category.slug,
    })
      .then((r) =>
        setProducts(
          r.data.results ?? r.data
        )
      )
      .finally(() => setLoading(false))
  }


  // Show all products
  const handleShowAllProducts = () => {
    setLoading(true)
    setSelectedCategory(null)

    getProducts({})
      .then((r) =>
        setProducts(
          r.data.results ?? r.data
        )
      )
      .finally(() => setLoading(false))
  }


  // Auto-slide banner
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide(
        (prev) =>
          (prev + 1) % banners.length
      )
    }, 4000)

    return () => clearInterval(interval)
  }, [])


  const nextSlide = () => {
    setCurrentSlide(
      (prev) =>
        (prev + 1) % banners.length
    )
  }


  const prevSlide = () => {
    setCurrentSlide(
      (prev) =>
        (prev - 1 + banners.length) %
        banners.length
    )
  }


  return (
    <div
      className="
        min-h-screen
        min-w-0
        bg-gradient-to-br
        from-blue-50
        via-white
        to-indigo-50
      "
    >

      {/* ===================================================== */}
      {/* IMAGE CAROUSEL */}
      {/* ===================================================== */}

      <div className="relative mb-6 sm:mb-8 -mx-4 -mt-4 sm:-mt-6">

        <div
          className="
            relative
            h-56
            sm:h-72
            md:h-96
            overflow-hidden
            rounded-b-2xl
            sm:rounded-b-3xl
          "
        >

          {banners.map((banner, idx) => (
            <div
              key={idx}
              className={`
                absolute
                inset-0
                transition-opacity
                duration-700
                ease-in-out
                ${
                  idx === currentSlide
                    ? 'opacity-100'
                    : 'opacity-0'
                }
              `}
            >

              <div
                className={`
                  bg-gradient-to-r
                  ${banner.gradient}
                  w-full
                  h-full
                  flex
                  items-center
                  justify-center
                  relative
                  overflow-hidden
                `}
              >

                {/* Background Pattern */}
                <div
                  className="
                    absolute
                    inset-0
                    opacity-20
                    pattern
                  "
                />


                {/* Banner Content */}
                <div
                  className="
                    relative
                    z-10
                    text-center
                    text-white
                    px-6
                    sm:px-8
                    max-w-3xl
                  "
                >

                  <div
                    className="
                      text-5xl
                      sm:text-6xl
                      md:text-7xl
                      mb-2
                      sm:mb-4
                    "
                  >
                    {banner.icon}
                  </div>

                  <h2
                    className="
                      text-2xl
                      sm:text-4xl
                      md:text-5xl
                      font-bold
                      mb-2
                      sm:mb-3
                    "
                  >
                    {banner.title}
                  </h2>

                  <p
                    className="
                      text-sm
                      sm:text-xl
                      md:text-2xl
                      text-gray-100
                    "
                  >
                    {banner.subtitle}
                  </p>

                </div>

              </div>

            </div>
          ))}


          {/* Previous Button */}
          <button
            onClick={prevSlide}
            aria-label="Previous slide"
            className="
              absolute
              left-2
              sm:left-4
              top-1/2
              -translate-y-1/2
              z-20
              bg-white/80
              hover:bg-white
              w-9
              h-9
              sm:w-12
              sm:h-12
              rounded-full
              flex
              items-center
              justify-center
              transition
              shadow-lg
              text-gray-800
              text-sm
              sm:text-base
            "
          >
            ❮
          </button>


          {/* Next Button */}
          <button
            onClick={nextSlide}
            aria-label="Next slide"
            className="
              absolute
              right-2
              sm:right-4
              top-1/2
              -translate-y-1/2
              z-20
              bg-white/80
              hover:bg-white
              w-9
              h-9
              sm:w-12
              sm:h-12
              rounded-full
              flex
              items-center
              justify-center
              transition
              shadow-lg
              text-gray-800
              text-sm
              sm:text-base
            "
          >
            ❯
          </button>


          {/* Slide Indicators */}
          <div
            className="
              absolute
              bottom-3
              sm:bottom-4
              left-1/2
              -translate-x-1/2
              z-20
              flex
              gap-1.5
              sm:gap-2
            "
          >
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() =>
                  setCurrentSlide(idx)
                }
                aria-label={`Go to slide ${idx + 1}`}
                className={`
                  h-2.5
                  sm:h-3
                  rounded-full
                  transition-all
                  ${
                    idx === currentSlide
                      ? 'bg-white w-6 sm:w-8'
                      : 'bg-white/50 hover:bg-white/70 w-2.5 sm:w-3'
                  }
                `}
              />
            ))}
          </div>

        </div>
      </div>


      {/* ===================================================== */}
      {/* MAIN CONTENT */}
      {/* ===================================================== */}

      <div
        className="
          max-w-6xl
          mx-auto
          px-4
          sm:px-5
          lg:px-6
          py-6
          sm:py-8
        "
      >

        {/* ================================================= */}
        {/* CATEGORIES */}
        {/* ================================================= */}

        <div className="mb-10 sm:mb-12">

          <h2
            className="
              text-2xl
              sm:text-3xl
              font-bold
              mb-4
              sm:mb-6
              text-gray-800
              flex
              items-center
              gap-2
              sm:gap-3
            "
          >
            <span className="text-3xl sm:text-4xl">
              🏪
            </span>

            <span>
              Shop by Category
            </span>
          </h2>


          {/* Category Grid */}
          <div
            className="
              grid
              grid-cols-2
              sm:grid-cols-3
              md:grid-cols-4
              lg:grid-cols-5
              gap-3
              sm:gap-4
            "
          >

            {categories.map((cat) => (
              <div
                key={cat.id}
                onClick={() =>
                  handleCategoryClick(cat)
                }
                className="
                  group
                  relative
                  bg-white
                  rounded-xl
                  shadow-md
                  hover:shadow-xl
                  transition-all
                  duration-300
                  overflow-hidden
                  hover:scale-[1.02]
                  sm:hover:scale-105
                  cursor-pointer
                "
              >

                {/* Category Image */}
                <div
                  className="
                    relative
                    w-full
                    h-36
                    sm:h-48
                    md:h-52
                    lg:h-60
                    bg-gray-100
                  "
                >

                  {cat.image ? (
                    <img
                      src={cat.image}
                      alt={cat.name}
                      loading="lazy"
                      className="
                        w-full
                        h-full
                        object-cover
                        group-hover:brightness-110
                        transition-all
                        duration-300
                      "
                    />
                  ) : (
                    <div
                      className="
                        w-full
                        h-full
                        bg-gradient-to-br
                        from-indigo-200
                        to-blue-200
                        flex
                        items-center
                        justify-center
                      "
                    >
                      <span className="text-3xl sm:text-4xl">
                        📦
                      </span>
                    </div>
                  )}

                  <div
                    className="
                      absolute
                      inset-0
                      bg-black/0
                      group-hover:bg-black/10
                      transition-all
                      duration-300
                    "
                  />

                </div>


                {/* Category Name */}
                <div className="p-2 sm:p-3 text-center">

                  <h3
                    className="
                      font-semibold
                      text-sm
                      sm:text-base
                      text-gray-800
                      group-hover:text-indigo-600
                      transition-colors
                      line-clamp-2
                    "
                  >
                    {cat.name}
                  </h3>

                </div>

              </div>
            ))}

          </div>
        </div>


        {/* ================================================= */}
        {/* PRODUCTS */}
        {/* ================================================= */}

        <div>

          {/* Products Header */}
          <div
            className="
              flex
              flex-col
              sm:flex-row
              sm:items-center
              gap-3
              mb-5
              sm:mb-6
            "
          >

            <div
              className="
                flex
                items-center
                gap-2
                sm:gap-3
                min-w-0
                flex-1
              "
            >
              <span className="text-3xl sm:text-4xl shrink-0">
                🎁
              </span>

              <h2
                className="
                  text-2xl
                  sm:text-3xl
                  font-bold
                  text-gray-800
                  truncate
                "
              >
                {selectedCategory
                  ? selectedCategory.name
                  : 'All Products'}
              </h2>
            </div>


            {/* Back Button */}
            {selectedCategory && (
              <button
                onClick={handleShowAllProducts}
                className="
                  w-full
                  sm:w-auto
                  shrink-0
                  flex
                  items-center
                  justify-center
                  gap-2
                  bg-indigo-600
                  hover:bg-indigo-700
                  text-white
                  px-4
                  py-2
                  rounded-lg
                  transition
                  font-medium
                  text-sm
                "
              >
                ← Back to All
              </button>
            )}

          </div>


          {/* Product Grid */}
          {loading ? (

            <div className="text-center py-12 sm:py-16">

              <div className="inline-block">

                <div
                  className="
                    animate-spin
                    rounded-full
                    h-10
                    w-10
                    sm:h-12
                    sm:w-12
                    border-b-2
                    border-indigo-600
                  "
                />

              </div>

              <p className="text-gray-400 mt-4 text-sm sm:text-base">
                Loading amazing products…
              </p>

            </div>

          ) : products.length === 0 ? (

            <div
              className="
                text-center
                py-12
                sm:py-16
                bg-white
                rounded-xl
                shadow
                px-4
              "
            >
              <p className="text-gray-400 text-base sm:text-lg">
                No products available at the moment.
              </p>
            </div>

          ) : (

            <div
              className="
                grid
                grid-cols-2
                sm:grid-cols-3
                md:grid-cols-4
                lg:grid-cols-5
                gap-3
                sm:gap-4
              "
            >
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  cartEnabled={cartEnabled}
                />
              ))}
            </div>

          )}

        </div>


        {/* ================================================= */}
        {/* BENEFITS */}
        {/* ================================================= */}

        <div
          className="
            mt-12
            sm:mt-16
            grid
            grid-cols-1
            md:grid-cols-3
            gap-4
            sm:gap-6
          "
        >

          {/* Fast Delivery */}
          <div
            className="
              group
              bg-gradient-to-br
              from-blue-50
              to-blue-100
              rounded-xl
              p-5
              sm:p-6
              shadow-md
              hover:shadow-xl
              transition
              transform
              hover:-translate-y-1
              cursor-pointer
              border
              border-blue-200
            "
          >
            <div
              className="
                text-4xl
                sm:text-5xl
                mb-3
                sm:mb-4
                group-hover:scale-110
                transition
              "
            >
              🚚
            </div>

            <h3 className="font-bold text-lg mb-2 text-gray-800">
              Fast Delivery
            </h3>

            <p className="text-gray-600 text-sm">
              Express delivery available 24/7
            </p>
          </div>


          {/* Best Prices */}
          <div
            className="
              group
              bg-gradient-to-br
              from-green-50
              to-green-100
              rounded-xl
              p-5
              sm:p-6
              shadow-md
              hover:shadow-xl
              transition
              transform
              hover:-translate-y-1
              cursor-pointer
              border
              border-green-200
            "
          >
            <div
              className="
                text-4xl
                sm:text-5xl
                mb-3
                sm:mb-4
                group-hover:scale-110
                transition
              "
            >
              💰
            </div>

            <h3 className="font-bold text-lg mb-2 text-gray-800">
              Best Prices
            </h3>

            <p className="text-gray-600 text-sm">
              Unbeatable deals and discounts
            </p>
          </div>


          {/* Quality */}
          <div
            className="
              group
              bg-gradient-to-br
              from-purple-50
              to-purple-100
              rounded-xl
              p-5
              sm:p-6
              shadow-md
              hover:shadow-xl
              transition
              transform
              hover:-translate-y-1
              cursor-pointer
              border
              border-purple-200
            "
          >
            <div
              className="
                text-4xl
                sm:text-5xl
                mb-3
                sm:mb-4
                group-hover:scale-110
                transition
              "
            >
              ✅
            </div>

            <h3 className="font-bold text-lg mb-2 text-gray-800">
              Quality Assured
            </h3>

            <p className="text-gray-600 text-sm">
              100% authentic guaranteed
            </p>
          </div>

        </div>

      </div>

    </div>
  )
}