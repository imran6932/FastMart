# 🛒 FastMart - Multi-Role Delivery Platform

A full-stack, production-ready **same-day delivery application** with real-time GPS tracking, order management, and live route optimization. Built with **Django/DRF** backend and **React** frontends for customers, riders, and admins.

## 🚀 Live Demo

- **Frontend Customer**: [fastmart.imranansari.in](https://fastmart.imranansari.in)
- **Frontend Rider**: [rider.fastmart.imranansari.in](https://rider.fastmart.imranansari.in)
- **Frontend Admin**: [admin.fastmart.imranansari.in](https://admin.fastmart.imranansari.in)
- **API Docs**: [api.fastmart.imranansari.in/api/docs/](https://api.fastmart.imranansari.in/api/docs/)


## 🎯 Project Overview

FastMart is a comprehensive e-commerce & delivery platform that connects:
- **👥 Customers** - Browse products, place orders, track delivery in real-time
- **🛵 Riders** - Accept orders, broadcast GPS location, view live routes  
- **🏢 Admins** - Manage products/categories, track all riders, monitor orders

### Key Features

#### 🛍️ Customer Features
- Browse products by category with real-time service area validation
- Add items to cart with instant +/− quantity controls
- Checkout with Razorpay payment integration
- Real-time order tracking with live rider GPS position
- See delivery address, rider details, and estimated route
- Order history with status timeline
- Push notifications for order updates
- Service availability check based on location

#### 🛵 Rider Features  
- View assigned delivery orders with customer address
- Toggle on-duty status to start/stop accepting orders
- Real-time GPS location broadcast (every 10 seconds)
- Live route map from warehouse to customer
- Auto-accept order assignment based on location proximity
- View order history and delivery completion status
- Persistent location tracking across page navigation

#### 🏢 Admin Features
- Complete product & category management (CRUD)
- Order monitoring with status tracking
- Rider management and warehouse assignments
- Live map showing all warehouses and active riders
- Individual rider tracking with route visualization
- Real-time order assignments and delivery batch management
- Django admin panel with OpenStreetMap integration

#### 🔄 Real-Time Features
- WebSocket-powered live location broadcasting
- Auto-reconnecting WebSocket with exponential backoff
- Order status event streaming
- Rider position updates on customer/admin maps
- Live route calculation with OSRM road-routing

---

## 📁 Project Structure

```
FastMart/
├── backend/                          # Django 5.2 + DRF
│   ├── apps/
│   │   ├── accounts/                # User, Rider, Admin profiles; GIS widgets
│   │   ├── products/                # Product & category management
│   │   ├── orders/                  # Cart, orders, order items, checkout
│   │   ├── payments/                # Razorpay payment integration
│   │   └── tracking/                # GPS tracking, warehouses, live routing
│   ├── fastmart/
│   │   ├── settings.py              # Django configuration
│   │   ├── asgi.py                  # Daphne ASGI for WebSocket
│   │   └── urls.py                  # URL routing
│   ├── manage.py
│   ├── requirements.txt
│   └── .env                         # Environment variables
│
├── frontend/
│   ├── customer/                     # React 18 + Vite (port 3001)
│   │   ├── src/
│   │   │   ├── pages/               # HomePage, CartPage, CheckoutPage, etc.
│   │   │   ├── components/          # ProductCard, Navbar, LiveRouteMap
│   │   │   ├── contexts/            # AuthContext, CartContext, LocationContext
│   │   │   ├── api/                 # API client & endpoints
│   │   │   └── utils/               # Helpers, reconnectingSocket
│   │   ├── vite.config.js
│   │   └── package.json
│   │
│   ├── rider/                        # React 18 + Vite (dev port 5174)
│   │   ├── src/
│   │   │   ├── pages/               # DashboardPage, OrderDetailPage, etc.
│   │   │   ├── components/          # LiveRouteMap, order cards
│   │   │   ├── contexts/            # AuthContext, LocationTrackingContext
│   │   │   ├── api/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── admin/                        # React 18 + Vite (dev port 5175)
│       ├── src/
│       │   ├── pages/               # ProductsPage, RidersPage, RidersMapPage
│       │   ├── components/          # LiveRouteMap
│       │   ├── contexts/            # AuthContext
│       │   ├── api/
│       │   └── utils/
│       └── package.json
│
├── docker-compose.yml               # PostGIS, Redis, Django backend, Celery worker/beat
├── deploy-frontend.sh               # Builds each frontend app in Docker, extracts /app/dist,
│                                     # and copies it to /home/fastmart/frontend/<app> on the host
├── Makefile                         # Shortcuts: docker-install, nginx-install, deploy-frontend,
│                                     # docker-compose-build/up/down/restart, nginx-restart
└── README.md                        # This file
```

> **Note on frontends in production**: `customer`, `rider`, and `admin` are each built via a
> single-stage Docker image (compiles `npm run build`, no nginx inside the container). There is
> no `nginx/` folder in the repo — the built `dist/` output is copied to the host
> (`/home/fastmart/frontend/<app>`) by `deploy-frontend.sh`, and a **host-level nginx** (installed
> via `make nginx-install`) serves the static files on port 80. This avoids running a containerized
> nginx that would conflict with port 80 already used by other projects on the same server.

---

## 🛠️ Tech Stack

### Backend
- **Framework**: Django 5.2, Django REST Framework (DRF)
- **Database**: PostGIS 18 / PostgreSQL (spatial queries via GeoDjango) — `postgis/postgis:18-3.6-alpine` image
- **Cache/WebSocket Broker**: Redis (alpine)
- **ASGI Server**: Daphne (WebSocket support)
- **Real-Time**: Django Channels + Redis
- **Background Tasks**: Celery worker + Celery Beat (DatabaseScheduler, e.g. stock-hold sweep)
- **Authentication**: JWT (djangorestframework-simplejwt)
- **Payment**: Razorpay SDK
- **Routing**: OSRM (for road-based route optimization)
- **Maps**: PostGIS for nearest-warehouse queries, CARTO tiles (admin panel only)

### Frontend (All 3 Apps)
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Maps**: Leaflet + OpenStreetMap tiles
- **State Management**: React Context API
- **HTTP**: Axios
- **Real-Time**: WebSocket with auto-reconnection
- **Forms**: Native HTML + custom validation
- **Routing**: React Router v6

### DevOps
- **Containers**: Docker + Docker Compose (backend, Celery worker/beat, PostGIS, Redis only)
- **Reverse Proxy**: Host-installed Nginx (not containerized — see `make nginx-install`)
- **Service Ports** (host → container, from `docker-compose.yml`):
  - Backend (Daphne): `8003` → `8000`
  - PostGIS: `5433` → `5432`
  - Redis: `6370` → `6379`
- **Frontend dev ports** (Vite dev server only, not exposed in Docker):
  - Customer: `3001`
  - Rider: `5174`
  - Admin: `5175`
- **Frontend production**: built via `./deploy-frontend.sh` (temp Docker container per app,
  extracts `dist/`, deletes the container) and copied to `/home/fastmart/frontend/<app>` on the
  host, served by host Nginx on port 80/443

---

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL 15+ with the **PostGIS** extension (or use the provided Docker service — no local install needed)
- GDAL, GEOS, and PROJ system libraries for GeoDjango (`gdal-bin`, `libgdal-dev`, `libgeos-dev`, `libproj-dev` on Debian/Ubuntu; see `backend/Dockerfile` for the exact package list)
- Redis
- Docker + Docker Compose (recommended, avoids installing PostgreSQL/PostGIS/GDAL locally)
- Git

### 1️⃣ Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env  # (or manually add required vars below)

# Backend environment variables are documented in backend/.env.example
# Key categories:
# - Django: SECRET_KEY, DEBUG, ALLOWED_HOSTS
# - Database: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
# - Redis: REDIS_HOST, REDIS_PORT
# - Razorpay: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
# - Maps: CARTO_API_KEY (for Django admin GIS widgets only)
# - Email: EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
# - Business: STOCK_HOLD_MINUTES, MAX_BATCH_SIZE, etc.

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start Daphne server
daphne -b 0.0.0.0 -p 8000 fastmart.asgi:application
```

### 2️⃣ Frontend Setup (Customer)

```bash
cd frontend/customer

# Install dependencies
npm install

# Create .env file from template
cp .env.example .env

# Frontend environment variables (in .env):
# VITE_BACKEND_URL=http://localhost:8000  (backend API proxy target)
# VITE_PORT=3001                           (dev server port)

# Development server (port 3001)
npm run dev

# Build for production
npm run build
```

### 3️⃣ Frontend Setup (Rider & Admin)

Repeat the same steps for:
- `frontend/rider` (port 5174): Run `npm run dev` from frontend/rider/
- `frontend/admin` (port 5175): Run `npm run dev` from frontend/admin/

Each app gets its own `.env` file with:
```
VITE_BACKEND_URL=http://localhost:8000
VITE_PORT=5174  # (or 5175 for admin)
```

### 4️⃣ Docker Compose (Backend + PostGIS + Redis + Celery)

`docker-compose.yml` builds and runs the backend stack — it does **not** include the frontend
apps (those are built separately, see the Production Deployment section below).

```bash
# From project root — env vars come from backend/.env for every service
docker-compose up -d

# Verify services
docker-compose ps

# Services started: postgis_db, redis, backend (Daphne on 8003→8000),
# celery_worker, celery_beat
```

Or use the provided `Makefile` shortcuts:
```bash
make docker-compose-build   # docker-compose build --no-cache
make docker-compose-up      # sudo docker-compose up -d + prune old images
make docker-compose-down    # sudo docker-compose down
```

---

## 🔐 Environment Variables & API Keys

### Backend Configuration (`backend/.env`)

All backend configuration is documented in `backend/.env.example`. Key variables:

| Variable | Purpose | Required | Notes |
|----------|---------|----------|-------|
| `SECRET_KEY` | Django secret | ✅ | Generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DEBUG` | Debug mode | ✅ | Set to `False` in production |
| `DB_*` | PostgreSQL connection | ✅ | Match docker-compose.yml service config |
| `REDIS_*` | Redis connection | ✅ | Used for Channels, Cache, Celery |
| `RAZORPAY_KEY_ID` | Payment gateway | ✅ | Get from https://dashboard.razorpay.com (Test mode for dev) |
| `RAZORPAY_KEY_SECRET` | Payment secret | ✅ | Test/Live keys available |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook verification | ✅ | Set when creating webhook in Razorpay dashboard |
| `CARTO_API_KEY` | Admin map tiles | ❌ | Optional. For Django admin GIS widgets only. Get free key from https://carto.com/basemaps/apikey/ |
| `VAPID_*` | Push notifications | ✅ | Generate with `python manage.py generate_vapid_keys` |
| `EMAIL_*` | SMTP credentials | ✅ | For OTP and email notifications |
| `STOCK_HOLD_MINUTES` | Business logic | ❌ | Default: 10 minutes |
| `RIDER_SEARCH_RADIUS_METRES` | Rider assignment | ❌ | Default: 50000 metres |
| `MAX_BATCH_SIZE` | Batch delivery | ❌ | Default: 4 orders per batch |
| `BATCH_WAITING_TIMES_SECONDS` | Batch timing | ❌ | Default: 240,180,120 (4 min, 3 min, 2 min) |

### Frontend Configuration (`frontend/*/env`)

Frontend apps use **minimal configuration** with only essential Vite variables:

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `VITE_BACKEND_URL` | Backend API proxy | ✅ | `http://localhost:8000` |
| `VITE_PORT` | Dev server port | ✅ | Customer: 3001, Admin: 5175, Rider: 5174 |

---

## 🗺️ Maps & Geolocation

### Customer Location Validation
- On app load, customer provides address/location
- System queries nearest warehouse using PostGIS `ST_DWithin`
- If warehouse found → service available → can order
- If not found → service unavailable → shows message

### Live Route Maps
- **Rider View**: Warehouse → Customer delivery address with rider's GPS
- **Customer View**: Real-time route with rider position marker
- **Admin View**: All warehouses + all on-duty riders on single map
- **Tile Provider**: OpenStreetMap (detailed street labels)
- **Route Engine**: OSRM for road-based routing (falls back to straight line)
- **Marker Icons**: 🏢 warehouse, 📍 destination, 🛵 rider

---

## 🎯 Rider Assignment Logic

### When Order is Placed
1. Payment succeeds → Order status = `confirmed`
2. Backend triggers **nearest-rider assignment**:
   - Query all on-duty riders for the order's warehouse: `RiderProfile.objects.filter(warehouse=warehouse, is_on_duty=True)`
   - Use PostGIS to find riders within delivery radius: `current_location__distance_lte=(delivery_point, D(m=5000))`
   - Sort by distance, pick the nearest
3. Create `DeliveryBatch` linking order → assigned rider
4. Order status = `assigned`
5. **WebSocket broadcast** to all connected clients (admin, customer, rider) with new status

### Rider Rejects / Route Replanned
- If rider marks order as undeliverable → trigger new assignment attempt
- Max `MAX_ASSIGNMENT_RETRIES` (configurable) before admin manual intervention

---

## 📈 Performance Tips

### Backend
- **Spatial Indexing**: GiST index on `RiderProfile.current_location` makes proximity queries fast
- **Database Connection Pooling**: Use PgBouncer in production for Django + Daphne multiple workers
- **Redis Caching**: Cache frequent queries (product list, warehouse list) with 5-10min TTL
- **Batch Updates**: Use `bulk_update()` for location pings if broadcasting to many riders

### Frontend
- **Code Splitting**: Vite automatically splits vendor chunks (React, Leaflet, etc.)
- **Image Optimization**: Use WebP format for product images where supported
- **Lazy Loading**: Load map components only when visible (Suspense boundaries)
- **LocalStorage Caching**: Cache product list, user profile for offline-first feel

### DevOps
- **Nginx Caching**: Cache static assets (images, CSS, JS) with 30-day expiry
- **Daphne Workers**: Run multiple Daphne processes behind Nginx load balancer
- **WebSocket Connection Pooling**: Limit to 1000 concurrent connections per Daphne worker

---

## 🔄 Deployment

### Local Development
```bash
# Terminal 1: Backend
cd backend && source .venv/bin/activate
daphne -b 0.0.0.0 -p 8000 fastmart.asgi:application

# Terminal 2: Customer Frontend
cd frontend/customer && npm run dev

# Terminal 3: Rider Frontend
cd frontend/rider && npm run dev

# Terminal 4: Admin Frontend
cd frontend/admin && npm run dev

# Terminal 5: Docker services
docker-compose up
```

---

## 📄 License

This project is private and proprietary. All rights reserved.

---

## 👨‍💻 Developed By

**Imran** - Full Stack Developer

For questions or support, contact: imransxcr53@gmail.com

---

## 📞 Support

- **Issues**: Open a GitHub issue with detailed reproduction steps
- **Docs**: Full API spec at `/api/schema/` (Swagger UI)
- **Logs**: Check `backend/logs/` for server errors, browser Console for frontend issues

---

**Happy Coding! 🚀**
