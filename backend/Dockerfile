FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# ─── System dependencies for GeoDjango ───────────────────────────────────────
# This is the most common failure point in GeoDjango setups.
# You need three C libraries: GEOS (geometry operations), GDAL (format I/O),
# and PROJ (coordinate projection). Without all three, PointField migrations
# and spatial queries will fail with cryptic import errors.
#
# libpq-dev + gcc are needed to compile psycopg2.
# g++ is needed because the GDAL PyPI package's bindings are C++ extensions
# (ogr/osr/gdal) — gcc alone is not enough to compile them.
# binutils is needed by GeoDjango's GDAL loader on some systems.
RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils \
    libproj-dev \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libgeos++-dev \
    python3-gdal \
    libpq-dev \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# ─── Install GDAL Python bindings pinned to the system GDAL version ──────────
# Critical: the GDAL PyPI package version must match the system GDAL version.
# A mismatch causes "OSError: libgdal.so not found" or version assertion errors.
# We query the installed version at build time and pin to it dynamically.
RUN GDAL_VERSION=$(gdal-config --version) && \
    echo "System GDAL version: $GDAL_VERSION" && \
    pip install --no-cache-dir "GDAL==${GDAL_VERSION}" && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# ─── Verify the spatial stack loads before any migrations run ─────────────────
# If this step fails, the GEOS/GDAL/PROJ libraries are not properly installed.
# Fix: check that libgeos-dev and libgdal-dev are installed above.
RUN python -c "from django.contrib.gis.geos import GEOSGeometry; print('GEOS OK')" \
    || (echo "GEOS import failed — check system lib installation" && exit 1)