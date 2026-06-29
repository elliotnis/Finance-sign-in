# Migrate Hosted Data to VPS MongoDB

The Docker Compose deployment includes a local `mongo` service. On the VPS, the backend should use that service.

## 1. Configure the VPS app to use the local database

Do not put the old hosted database connection value in `.env` after migration. It should only be used temporarily while importing data.

## 2. Start MongoDB on the VPS

```bash
cd ~/sign-up-system
docker compose up -d mongo
docker compose ps
```

## 3. Migrate the existing data

Set the hosted database connection value only in the current shell session:

```bash
export SOURCE_DATABASE_URI='paste the temporary connection value here'
```

Run the migration:

```bash
chmod +x scripts/migrate-atlas-to-compose-mongo.sh
./scripts/migrate-atlas-to-compose-mongo.sh
```

The script dumps the `sign_up_system` database from the hosted source and restores it into the Compose MongoDB container using `--drop`, replacing any existing local collections with the imported data.

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
unset SOURCE_DATABASE_URI
```

## Notes

- The Compose file does not publish the database port to the VPS network, so the database is reachable by the backend container but not directly from the internet.
- Keep the `.env` file on the VPS only. Do not commit hosted database credentials or SMTP secrets.
- Keep the `mongo_data` Docker volume. Running `docker compose down` is fine; do not run `docker compose down -v` unless you intentionally want to delete the VPS database.
