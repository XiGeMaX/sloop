#!/bin/sh
set -eu

if [ "$(id -u)" -eq 0 ]; then
  database_path="${SLOOP_DATABASE_PATH:-/data/sloop.db}"
  secret_path="${SLOOP_SECRET_FILE:-$(dirname "$database_path")/signing-secret}"
  database_dir="$(dirname "$database_path")"
  secret_dir="$(dirname "$secret_path")"

  prepare_directory() {
    directory="$1"
    if [ "$directory" = "/" ]; then
      echo "Refusing to change ownership of the container root directory" >&2
      exit 1
    fi

    mkdir -p "$directory"
    chown -R sloop:sloop "$directory"
  }

  prepare_directory "$database_dir"
  if [ "$secret_dir" != "$database_dir" ]; then
    prepare_directory "$secret_dir"
  fi

  exec su-exec sloop:sloop "$@"
fi

exec "$@"
