#!/usr/bin/env bash
set -euo pipefail

if [ -z "${ATLAS_MONGODB_URL:-}" ]; then
  echo "Set ATLAS_MONGODB_URL to the MongoDB Atlas connection string before running this script." >&2
  echo "Example:" >&2
  echo "  export ATLAS_MONGODB_URL='mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority'" >&2
  exit 1
fi

DB_NAME="${DB_NAME:-sign_up_system}"
DUMP_DIR="${DUMP_DIR:-mongo-migration-dump}"
DUMP_PATH="$(pwd)/${DUMP_DIR}"

echo "Starting local MongoDB service..."
docker compose up -d mongo

echo "Waiting for local MongoDB healthcheck..."
for _ in $(seq 1 60); do
  status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$(docker compose ps -q mongo)")"
  if [ "$status" = "healthy" ] || [ "$status" = "unknown" ]; then
    break
  fi
  sleep 2
done

rm -rf "$DUMP_PATH"
mkdir -p "$DUMP_PATH"
chmod 700 "$DUMP_PATH"

echo "Dumping Atlas database '${DB_NAME}'..."
docker run --rm \
  -v "$DUMP_PATH:/dump" \
  mongo:7 \
  mongodump --uri "$ATLAS_MONGODB_URL" --db "$DB_NAME" --out /dump

if [ ! -d "$DUMP_PATH/$DB_NAME" ]; then
  echo "Expected dump directory '$DUMP_PATH/$DB_NAME' was not created." >&2
  exit 1
fi

mongo_container="$(docker compose ps -q mongo)"
restore_path="/tmp/${DUMP_DIR}-${DB_NAME}"

echo "Copying dump into local MongoDB container..."
docker exec "$mongo_container" rm -rf "$restore_path"
docker exec "$mongo_container" mkdir -p "$restore_path"
docker cp "$DUMP_PATH/$DB_NAME/." "$mongo_container:$restore_path"

echo "Restoring into local MongoDB database '${DB_NAME}' with --drop..."
docker compose exec -T mongo \
  mongorestore --drop --db "$DB_NAME" "$restore_path"

docker exec "$mongo_container" rm -rf "$restore_path"

echo "Migration complete."
echo "Dump left on disk at: $DUMP_PATH"
echo "Remove it after verifying the app:"
echo "  rm -rf '$DUMP_PATH'"
