# Earth Engine setup (for the field-health feature)

Google Earth Engine (GEE) is Google's platform for satellite data. The planned field-health service
uses it to read Sentinel-2 images of a diagnosed field and compare the field with its neighbours.
You need to do this setup once. Every step here happens in your Google account, and nothing secret
ever goes into git.

Commands are for **Windows PowerShell**. Run them from the project folder. The project used is the
one the app already runs in, `plant-disease-503711`.

## 0. Licence check (read first)

- Earth Engine is free only for **noncommercial** use: research, education, nonprofits, government,
  and personal non-commercial projects.
- If the app ever makes money (paid features, ads, a company selling it), you need a **commercial
  plan**. That's a paid subscription plus compute charges, chosen on the same registration page.
- When you register, the questionnaire asks what the project is for. Answer honestly. Google checks
  eligibility, and access can be paused if the use doesn't qualify.

## 1. Register the project for Earth Engine (about 10 minutes)

1. Open https://console.cloud.google.com/earth-engine and pick the project `plant-disease-503711` at
   the top.
2. Choose **noncommercial (unpaid) use** and fill in the registration questionnaire. Access starts
   right after it's accepted.
3. Pick a **quota tier**. Earth Engine measures compute in *EECU-hours*: an Earth Engine Compute Unit
   working for an hour.

   | Tier | Free compute per month | Needs |
   |---|---|---|
   | **Community** (default) | 150 EECU-hours | nothing |
   | **Contributor** | 1,000 EECU-hours | a billing account on the project (Earth Engine noncommercial use is still not charged) |
   | Partner | 100,000 EECU-hours | an application, for high-impact sustainability work |

   This project already has billing (Cloud Run), so **Contributor** is available, and Community is
   plenty to start. **Cost per call is measured, not guessed:** 2–3 tiny test queries already showed
   about 400 EECU-seconds in the Quotas page, so a field check may cost tens to hundreds of
   EECU-seconds. The service measures it (section 4) and caches every result, and this guide is
   updated with the real number once it's known.

   Going over the tier isn't a hard stop: the project gets *slower* until the month resets.
4. Turn on the API:
   ```powershell
   gcloud services enable earthengine.googleapis.com --project plant-disease-503711
   ```

## 2. Check that it works from your own account (about 5 minutes)

This installs the Earth Engine Python library into the project's virtual environment and signs in
**as you** (a browser window opens; choose the account that owns the project). No key file is
created.

```powershell
.venv\Scripts\python -m pip install earthengine-api
```
```powershell
gcloud auth application-default login --scopes="https://www.googleapis.com/auth/earthengine,https://www.googleapis.com/auth/cloud-platform"
```
```powershell
gcloud auth application-default set-quota-project plant-disease-503711
```

Why gcloud and not `earthengine authenticate`: Google can block that command's sign-in ("This app is
blocked"). That happened on this project on 26 Sep 2026. Signing in through gcloud (Application
Default Credentials) works, and the Earth Engine library picks it up automatically.
```powershell
.venv\Scripts\python -c "import ee; ee.Initialize(project='plant-disease-503711'); print(ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(ee.Geometry.Point(75.85, 30.90)).filterDate('2026-08-01', '2026-09-01').size().getInfo(), 'Sentinel-2 images')"
```

A number such as `12 Sentinel-2 images` means access works. An error that mentions
"not registered" or "permission" means step 1 isn't finished yet.

## 3. A service account for the geo-service (about 5 minutes)

The field-health service runs on Cloud Run as its own *service account*: a robot identity with only
the permissions it needs.

```powershell
gcloud iam service-accounts create geo-service --display-name "Field health (Earth Engine)" --project plant-disease-503711
```
```powershell
gcloud projects add-iam-policy-binding plant-disease-503711 --member "serviceAccount:geo-service@plant-disease-503711.iam.gserviceaccount.com" --role roles/earthengine.viewer
```
```powershell
gcloud projects add-iam-policy-binding plant-disease-503711 --member "serviceAccount:geo-service@plant-disease-503711.iam.gserviceaccount.com" --role roles/serviceusage.serviceUsageConsumer
```

- `roles/earthengine.viewer` (*Earth Engine Resource Viewer*) lets it run Earth Engine
  computations.
- `roles/serviceusage.serviceUsageConsumer` lets it bill that usage to this project's quota.

The service account doesn't need its own Earth Engine registration: the project is registered.

### Keys: don't create one

- **On Cloud Run:** the service is deployed with `--service-account geo-service@…`. Google hands
  it credentials automatically (Application Default Credentials), so no key file exists that could
  leak.
- **On your computer:** the code uses your own sign-in from step 2.
- **Only if the service ever runs outside Google Cloud** does it need a JSON key:
  1. Create it in Console → IAM → Service accounts → geo-service → Keys → Add key → JSON.
  2. Keep the file **outside the project folder**.
  3. Store it in Secret Manager (`gcloud secrets create ee-sa-key --data-file=<path>`).
  4. Mount it into the service as a file.
  5. Delete the downloaded copy.
  6. Never commit it: `.gitignore` blocks `*-key.json` and `.private-key.json` as a safety net.

## 4. Watching the quota (about 5 minutes)

- **Usage:** Console → Monitoring → **Metrics Explorer** → metric
  `earthengine.googleapis.com/project/cpu/usage_time` (Earth Engine CPU usage, in EECU-seconds).
  Group it by the `workload_tag` label: the service tags every call (`field-health`), so its usage
  shows separately. Google's example notebook for a monthly view:
  [earth_engine_noncommercial_eecu_monitor.ipynb](https://github.com/google/earthengine-community/blob/master/guides/linked/cloud-monitoring/earth_engine_noncommercial_eecu_monitor.ipynb).
- **A daily cap:** Console → IAM & Admin → **Quotas**, filter by Service `earthengine.googleapis.com`,
  then the row **EECU-seconds per day** → ⋮ → Edit quota → **18000** (the monthly 540,000 ÷ 30),
  so a bug or abuse can't use more than one day's share
  ([cost controls](https://developers.google.com/earth-engine/guides/cost_controls)). Set on this
  project on 26 Sep 2026. Lowering a quota applies immediately.
- **Why per-call EECU isn't in the app's logs:** Earth Engine doesn't return the cost of a single
  interactive request. The service logs how long each call took plus the workload tag, and the exact
  EECU numbers per tag come from Monitoring.

## 5. Optional: ALU field boundaries

Google's *Agricultural Landscape Understanding* (ALU) API gives the real outline of each field in
India. The service works without it: it then uses a 30 m circle around the point and says so in
every answer.

What access needs today ([FAQ](https://agri.withgoogle.com/faq/)):
- a Cloud project **with billing**, which this one has;
- a **Google Workspace Customer ID (GWCID)** and the email of the person enabling it, sent to
  Google's team (via the [Agricultural Understanding site](https://agri.withgoogle.com/));
- waiting for the allowlist, then enabling the **Agricultural Understanding API** in the project
  and creating an **API key**. Restrict the key to that API, and store it in Secret Manager as
  `alu-api-key`, never in git.

A personal Gmail account has no GWCID, so this may not be possible for an individual developer.
In that case, skip it; the 30 m fallback is built for that.

## 6. What to send back

Nothing secret. Only:

| Item | Example | Secret? |
|---|---|---|
| Earth Engine registered, and which tier | "done, Community" | no |
| The test in step 2 printed a number | "12 images" | no |
| Service account created with both roles | `geo-service@plant-disease-503711.iam.gserviceaccount.com` | no (it's a name, not a key) |
| ALU: got access? | "no" / "yes, key saved as secret `alu-api-key`" | the **name** only, never the key |
| **3 real field coordinates** | `30.9010, 75.8573, wheat, sown ~Nov 2025` | personal data: use fields whose owners agreed |

For the coordinates: decimal degrees (right-click a spot in Google Maps and click the numbers to copy
them). Ideally three different crops or states, and one in a kharif (monsoon) area, to test cloudy
months.
