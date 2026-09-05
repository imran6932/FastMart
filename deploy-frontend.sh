#!/bin/bash
# Builds each frontend app's Docker image, extracts the built /app/dist folder
# via a temporary (never-started) container, and copies it to the local
# server path. The temp container is removed right after copying.
#
# Usage: ./deploy-frontend.sh

set -e

APPS=("admin" "customer" "rider")
DEPLOY_ROOT="/home/FastMart/frontend"

for app in "${APPS[@]}"; do
  echo "== Building $app =="
  docker build -t "fastmart-${app}-build" "./frontend/${app}"

  echo "== Extracting dist for $app =="
  docker create --name "temp-${app}" "fastmart-${app}-build"

  mkdir -p "${DEPLOY_ROOT}"
  rm -rf "${DEPLOY_ROOT}/${app}/dist"
  echo "removed old dist for $app"
  docker cp "temp-${app}:/app/dist" "${DEPLOY_ROOT}/${app}/dist"

  docker rm "temp-${app}"
  docker rmi "fastmart-${app}-build"

  echo "== $app dist deployed to ${DEPLOY_ROOT}/${app}/dist =="
  echo
done

echo "All frontend apps deployed under ${DEPLOY_ROOT}/"
