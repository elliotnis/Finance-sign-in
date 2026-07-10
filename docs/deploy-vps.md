# Deploy to FNZ231 (GitHub Actions)

Pushing to `main` or `master` runs the test job and then deploys to the FNZ231 Docker Compose host. The deployment updates the existing clone at `/home/adm1/sign-up-system`, keeps its `.env` file and MongoDB Docker volume, rebuilds the images, and verifies the web page and `/api/docs` endpoint.

## One-time GitHub configuration

In **Settings → Secrets and variables → Actions → Secrets**, create:

| Secret | Required | Purpose |
| --- | --- | --- |
| `VPS_SSH_PASSWORD` | Yes | Password for the deployment account on FNZ231. |

The workflow deliberately does not store the server password in the repository.

The following repository variables are optional; the values shown are the configured defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VPS_HOST` | `143.89.175.90` | FNZ231 address. |
| `VPS_USER` | `adm1` | SSH deployment user. |
| `VPS_SSH_PORT` | `22` | SSH port. |
| `VPS_DEPLOY_PATH` | `/home/adm1/sign-up-system` | Existing application checkout on the server. |

## Server requirements

FNZ231 already meets these requirements: Docker Engine, Docker Compose v2, a clone of this repository at the deployment path, and an SSH key/configuration that allows that clone to fetch `origin` from GitHub. Its `.env` remains only on the server and continues to provide SMTP, database, frontend URL, and other runtime settings. The workflow pins the server's current ED25519 SSH host-key fingerprint, so it will deliberately fail if the host key changes.

## Deployment behaviour

1. GitHub Actions builds the frontend and syntax-checks the backend.
2. The deploy job connects over SSH and fetches the pushed branch in the existing server clone.
3. It force-checks out `origin/main` or `origin/master` in that clone. This resets **tracked application files** only; `.env` and Docker volumes are not removed.
4. `docker compose up -d --build --remove-orphans` rebuilds and restarts the stack.
5. The workflow waits for `http://127.0.0.1/` and `http://127.0.0.1/api/docs`; a failure makes the GitHub Actions run fail.

For stronger long-term access control, replace password authentication with a dedicated, restricted SSH deploy key and update the workflow to use it. Rotate the current shared server password after adding the GitHub secret.
