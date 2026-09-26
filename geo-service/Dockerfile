FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 app

COPY app.py field_health.py ./

USER app
EXPOSE 8000
# Cloud Run passes $PORT. No access log: app.py logs each call as JSON without coordinates or client IPs.
# Credentials: the Cloud Run service account (geo-service@...), never a key file (docs/GEE_SETUP.md).
CMD exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log
