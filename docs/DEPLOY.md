# Deploying on free tiers

| Part | Runs on | Free-tier limit that matters |
|---|---|---|
| React client | Vercel (Hobby) | 100 GB bandwidth/month |
| Express server | Google Cloud Run, scales to zero | 180,000 vCPU-s, 360,000 GiB-s and 2M requests per month |
| ML service (FastAPI + ONNX Runtime) | Google Cloud Run, scales to zero | same pool as above |
| Container images | Google Artifact Registry | 0.5 GB storage |
| Secrets | Google Secret Manager | 6 active secret versions, 10,000 accesses/month |
| Database | MongoDB Atlas M0 | 512 MB |
| Photos and heatmaps | Cloudinary Free | 25 credits/month (1 credit = 1 GB stored or 1 GB delivered) |

## Expected cost at 1,000 predictions/month: about $0

| Item | Usage at 1,000 predictions | Cost |
|---|---|---|
| Cloud Run | Worst case, every call a cold start (~4 s): ML 2 vCPU × 4 s × 1,000 = 8,000 vCPU-s and 1 GiB × 4,000 s = 4,000 GiB-s; the server is smaller still. That's under 5% of the free pool. | $0 |
| Artifact Registry | 2 ML images (~184 MB each, sharing most layers) plus a few server images (~80–106 MB, sharing the Node base) with the cleanup policy below: under 0.5 GB | $0 (about $0.10/GB/month above 0.5 GB) |
| Secret Manager | 4 secrets; each container start reads them once | $0 |
| Atlas M0 | about 2 KB per record (heatmaps live in Cloudinary): about 2 MB/month | $0 |
| Cloudinary | photo (≤ 1280 px, ~200 KB) + heatmap (~80 KB) = about 0.3 GB stored per month, plus views | $0 while the total stays under 25 GB. At this rate that's years. |
| Network egress | about 110 KB response × 1,000 = 0.1 GB | about $0.01 |

- Google needs a billing account even for the free tier. Set a budget alert (step A2) so any surprise
  shows up as an email, not a bill.
- The running limit is **max 3 instances** per service. Under an attack, the worst case is 3 instances
  busy all month. The per-IP rate limits (docs/SECURITY.md) stop that long before it matters.

## Steps only you can do

1. **Google account with a billing account** attached to the project (a card is needed even for the
   free tier). Step A2.
2. **MongoDB Atlas**: create the free M0 cluster, a database user and the network rule. Step A5.
3. **Cloudinary**: sign up and copy the cloud name, API key and API secret. Step A6.
4. **Secrets**: paste the MongoDB URI and Cloudinary secret, and generate the JWT and ML-token secrets.
   Step A7. Nobody else should see these values; they never go into git.
5. **Vercel**: import the GitHub repo and set `VITE_API_URL`. Step B3.
6. **Optional custom domain**: add it in Vercel (Settings → Domains), then add it to `CLIENT_ORIGINS`
   (step B2).
7. **Upgrading the deployment that is live now** (Part C): move the secrets to Secret Manager, run the
   heatmap migration and clear old images.

Commands are for **Windows PowerShell**. Run each block in the same window: the `$PROJECT`/`$REGION`
variables from block 0 only live in that window. If you open a new window, run block 0 again.

```powershell
# 0. Settings used by every command below (change the project id if you create a new project)
$PROJECT = "plant-disease-503711"
$REGION  = "asia-south1"
$REPO    = "$REGION-docker.pkg.dev/$PROJECT/plant-disease"
```

## Part A — one-time setup

**A1. Tools.** Install Google Cloud CLI (https://cloud.google.com/sdk/docs/install) and Docker
Desktop, then:

```powershell
gcloud auth login
gcloud config set project $PROJECT
gcloud config set run/region $REGION
gcloud auth configure-docker "$REGION-docker.pkg.dev"
```

**A2. Project and billing** (skip if the project exists).
- Create the project in the console (https://console.cloud.google.com/projectcreate).
- Link a billing account (Billing → Link a billing account).
- Add a budget alert: Billing → Budgets & alerts → Create budget, $1, alerts at 50/90/100%.

**A3. APIs:**

```powershell
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

**A4. Image registry**, with a cleanup policy that keeps it inside the 0.5 GB free storage. The policy
keeps the 6 newest versions and deletes older ones after 14 days, so rollback targets stay available
for two weeks. One `docker push` of the ML image creates 3 versions (image, attestation and index), so
6 versions means the current ML image plus one rollback:

```powershell
gcloud artifacts repositories create plant-disease --repository-format=docker --location=$REGION
gcloud artifacts repositories set-cleanup-policies plant-disease --location=$REGION --policy=docs/artifact-cleanup-policy.json --no-dry-run
```

`gcloud run deploy --source` also creates a `cloud-run-source-deploy` repository for the server
image. Give it the same policy after the first server deploy:

```powershell
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy --location=$REGION --policy=docs/artifact-cleanup-policy.json --no-dry-run
```

**A5. MongoDB Atlas** (https://cloud.mongodb.com):
1. Create a free **M0** cluster (region: Mumbai / AWS ap-south-1, close to Cloud Run's asia-south1).
2. Database Access → add a user with a long random password and the role "Read and write to any
   database".
3. Network Access → add `0.0.0.0/0`. Cloud Run has no fixed outgoing IP on the free tier, so the long
   password is the protection.
4. Connect → Drivers → copy the `mongodb+srv://...` URI and put the password into it.

**A6. Cloudinary** (https://cloudinary.com): sign up. The dashboard shows the cloud name, API key and
API secret.

**A7. Secrets.** Four values go to Secret Manager: the MongoDB URI, the Cloudinary API secret, a JWT
secret and the ML service token. The cloud name and API key aren't secret and stay plain settings.

```powershell
# helper: prompts for a value and stores it without a trailing newline (a newline breaks the URI)
function Add-Secret($name) {
  gcloud secrets describe $name *> $null
  if (-not $?) { gcloud secrets create $name --replication-policy=automatic }
  $f = New-TemporaryFile
  [IO.File]::WriteAllText($f, (Read-Host "Paste the value for $name"))
  gcloud secrets versions add $name --data-file=$f
  Remove-Item $f
}
Add-Secret mongodb-uri              # the mongodb+srv://... URI from A5
Add-Secret cloudinary-api-secret    # from A6
```

```powershell
# these two are just long random strings: generate them instead of typing
function New-RandomSecret($name) {
  gcloud secrets describe $name *> $null
  if (-not $?) { gcloud secrets create $name --replication-policy=automatic }
  $f = New-TemporaryFile
  [IO.File]::WriteAllText($f, (python -c "import secrets; print(secrets.token_urlsafe(32), end='')"))
  gcloud secrets versions add $name --data-file=$f
  Remove-Item $f
}
New-RandomSecret jwt-secret
New-RandomSecret ml-service-token
```

Let the Cloud Run services read the secrets. They run as the project's default compute service
account:

```powershell
$NUMBER = gcloud projects describe $PROJECT --format="value(projectNumber)"
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$NUMBER-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
```

## Part B — deploy (first time and every update)

From the repository root.

**B1. ML service.** The Docker build installs TensorFlow once, in a build stage, to convert the
tracked Keras weights to ONNX. The final image has no TensorFlow (docs/SERVING.md). The first build
takes about 10 minutes.

```powershell
$TAG = git rev-parse --short HEAD    # image tag = the commit it was built from
docker build -t "$REPO/ml-service:$TAG" ml-service
docker push "$REPO/ml-service:$TAG"
gcloud run deploy ml-service --image "$REPO/ml-service:$TAG" --region $REGION --cpu 2 --memory 1Gi --concurrency 4 --min-instances 0 --max-instances 3 --cpu-boost --timeout 60 --allow-unauthenticated --set-secrets "ML_SERVICE_TOKEN=ml-service-token:latest"
```

Why these settings (benchmark in docs/SERVING.md, measured at 2 CPU):

| Setting | Value | Reason |
|---|---|---|
| `--cpu 2` | 2 vCPU | p50 ~200 ms and cold start ~3 s at 2 vCPU. Billing only counts time spent on requests, so the free pool easily covers it. |
| `--memory 1Gi` | 1 GiB | Measured RAM is ~150 MiB, so this leaves room for 4 concurrent requests. |
| `--concurrency 4` | 4 | Inference is CPU-bound, so more requests per instance only queue inside it. |
| `--min-instances 0` | 0 | Scale to zero: no cost when idle, at the price of a cold start (below). |
| `--max-instances 3` | 3 | Cost ceiling. |
| `--cpu-boost` | on | Extra CPU while the instance starts, for shorter cold starts. |
| `--allow-unauthenticated` | public URL | The server authenticates with `ML_SERVICE_TOKEN`, and `/predict-disease` refuses calls without it. Making the service fully private (IAM invoker) is listed in docs/SECURITY.md. |

**B2. Server.** Built from source by Cloud Build (`server/Dockerfile`). `CLIENT_ORIGINS` is your
Vercel address. If you don't know it yet, use `https://<the-vercel-project-name>.vercel.app` and fix
it after B3.

```powershell
$ML_URL = gcloud run services describe ml-service --region $REGION --format="value(status.url)"
$CLOUD_NAME = Read-Host "Cloudinary cloud name"
$CLOUD_KEY  = Read-Host "Cloudinary API key"
gcloud run deploy server --source server --region $REGION --cpu 1 --memory 512Mi --min-instances 0 --max-instances 3 --cpu-boost --timeout 180 --allow-unauthenticated --set-env-vars "FASTAPI_URL=$ML_URL,CLOUDINARY_CLOUD_NAME=$CLOUD_NAME,CLOUDINARY_API_KEY=$CLOUD_KEY,CLIENT_ORIGINS=https://ai-plant-disease-detection-system.vercel.app" --set-secrets "MONGODB_URI=mongodb-uri:latest,JWT_SECRET=jwt-secret:latest,CLOUDINARY_API_SECRET=cloudinary-api-secret:latest,ML_SERVICE_TOKEN=ml-service-token:latest"
```

- `--timeout 180` covers the ML call (60 s timeout, one retry after a cold-start 503) with margin.
- Several origins (for example a custom domain as well): change the separator so the commas survive,
  e.g. `--update-env-vars "^;^CLIENT_ORIGINS=https://a.vercel.app,https://www.example.com"`.
- The server refuses to start if a required variable is missing and names it in the logs
  (`gcloud run services logs read server --region $REGION --limit 20`). Cloud Run then keeps
  serving the previous revision.

**B3. Client on Vercel** (https://vercel.com → Add New → Project → import the GitHub repo):
- Root Directory: `client`. The framework is detected as Vite: build `npm run build`, output `dist`.
- Environment variable `VITE_API_URL` = the server URL plus `/api`. Print it with:
  ```powershell
  "$(gcloud run services describe server --region $REGION --format='value(status.url)')/api"
  ```
- Deploy. Every push to `main` redeploys automatically. `client/vercel.json` sends every path to the
  SPA, so reloading `/history` works.
- If the Vercel address differs from what you put in `CLIENT_ORIGINS`:
  `gcloud run services update server --region $REGION --update-env-vars CLIENT_ORIGINS=https://<your-address>`

**B4. Check.**

```powershell
curl.exe -s "$ML_URL/health"                      # lists all 10 crop models and their versions
curl.exe -s -o NUL -w "%{http_code}`n" -X POST "$ML_URL/predict-disease"   # 401: the token is required
```

Then open the site and check one leaf photo. The first check after an idle spell shows "Waking up the
model…" and takes 5–15 s; later ones take under a second.

## Part C — upgrading the deployment that is live today

The live services still have their secrets as plain environment variables, and records made before
this change hold the heatmap inside MongoDB.

1. **Secrets to Secret Manager.**
   - Run A3 (enable `secretmanager.googleapis.com`), then the `Add-Secret` / `New-RandomSecret` blocks
     and the IAM binding from A7.
   - For `mongodb-uri`, paste the same URI the server uses today.
   - `ml-service-token` and `jwt-secret` can be new random values.
   - Then run B1 and B2. They switch both services to the secrets in one go: `--set-env-vars` and
     `--set-secrets` replace the old plain values.
   - If gcloud answers "already been set with a different type", run this once, then repeat B2:
     `gcloud run services update server --region $REGION --remove-env-vars MONGODB_URI,JWT_SECRET,CLOUDINARY_API_SECRET,ML_SERVICE_TOKEN`
     (do the same for `ml-service` with `ML_SERVICE_TOKEN`).
   - **Deploy the ML service first when the token changes.** Until the server is redeployed with the
     same token, predictions fail with 502. B1 then B2 back to back keeps that to about a minute.
2. **Move old heatmaps out of MongoDB** (after the new server is live). It only reads and rewrites the
   `gradcam` field, and is safe to re-run:
   ```powershell
   cd server
   node --env-file=.env scripts/migrate-gradcam.js            # dry run: how many records and MB
   node --env-file=.env scripts/migrate-gradcam.js --apply    # upload each to Cloudinary, keep the URL
   ```
3. **Free the registry.** It held about 1.7 GB on 26 Sep 2026, and the old TensorFlow `v1` image alone
   is 923 MB. Set the cleanup policies from A4. After 14 days they delete old images automatically,
   including `v1`. To free the space now: Console → Artifact Registry → `plant-disease` → `ml-service`
   → select the old versions → Delete. Keep the one Cloud Run is running.

## Rollback

Every deploy creates a new revision; the old ones stay until the images are cleaned up.

```powershell
gcloud run revisions list --service ml-service --region $REGION --limit 5
gcloud run services update-traffic ml-service --region $REGION --to-revisions <previous-revision-name>=100
```

The same works for `server`.

## Cold starts

Both services scale to zero, so the first request after roughly 15 idle minutes starts containers:
- server: about 2 s;
- ML service: about 3 s (ONNX; it was 6–12 s with TensorFlow).

The client shows "Waking up the model…" after 8 s. The server retries a 429/502/503/504 or a dropped
connection to the ML service once, after 1 s. It never retries after its own 60 s timeout, which
would double the wait. For a demo where the first click must be fast,
`--min-instances 1` on ml-service removes the cold start. It keeps one instance warm all month and is billed at the idle rate, which
exceeds the free tier: roughly $10–20/month at 2 vCPU / 1 GiB.

## TODO: GitHub Actions deploy (Workload Identity Federation)

Not set up yet: the manual path above is enough for a first deploy, and WIF needs several one-time IAM
steps in your project. When wanted, add `.github/workflows/deploy.yml` (`workflow_dispatch`) that:
- authenticates with `google-github-actions/auth@v2` (`workload_identity_provider` +
  `service_account`, no JSON key);
- builds and pushes the ML image, then runs the B1 and B2 deploy commands.

The service account needs `roles/run.admin`, `roles/artifactregistry.writer`,
`roles/iam.serviceAccountUser` and `roles/cloudbuild.builds.editor`. Setup guide:
https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account
