# Migrate MongoDB Atlas to VPS MongoDB

The Docker Compose deployment includes a local `mongo` service. On the VPS, the backend should use that service instead of Atlas.

## 1. Configure the VPS app to use local MongoDB

In the repo root on the VPS, edit `.env`:

```env
# Leave this unset, or set it explicitly:
MONGODB_URL=mongodb://mongo:27017
```

Do not put the Atlas URI in `.env` after migration. The Atlas URI should only be used temporarily while importing data.

## 2. Start MongoDB on the VPS

```bash
cd ~/sign-up-system
docker compose up -d mongo
docker compose ps
```

## 3. Migrate the Atlas data

Set the Atlas URI only in the current shell session:

```bash
export ATLAS_MONGODB_URL='mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority'
```

Run the migration:

```bash
chmod +x scripts/migrate-atlas-to-compose-mongo.sh
./scripts/migrate-atlas-to-compose-mongo.sh
```

The script dumps the `sign_up_system` database from Atlas and restores it into the Compose MongoDB container using `--drop`, replacing any existing local collections with the Atlas data.

If the Atlas database name is different:

```bash
DB_NAME=your_database_name ./scripts/migrate-atlas-to-compose-mongo.sh
```

## 4. Start the full app

```bash
docker compose up -d --build
docker compose ps
```

## 5. Verify the migration

```bash
docker compose exec mongo mongosh --quiet --eval 'db.getSiblingDB("sign_up_system").getCollectionNames()'
docker compose exec mongo mongosh --quiet --eval 'db.getSiblingDB("sign_up_system").user_collection.countDocuments()'
```

Then open the app and verify users/classes/sessions are present.

## 6. Clean up the local dump

After verifying:

```bash
rm -rf mongo-migration-dump
unset ATLAS_MONGODB_URL
```

## Notes

- The Compose file does not publish MongoDB port `27017` to the VPS network, so MongoDB is reachable by the backend container but not directly from the internet.
- Keep the `.env` file on the VPS only. Do not commit Atlas credentials or SMTP secrets.
- Keep the `mongo_data` Docker volume. Running `docker compose down` is fine; do not run `docker compose down -v` unless you intentionally want to delete the VPS database.
