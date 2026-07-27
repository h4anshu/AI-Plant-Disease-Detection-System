FROM python:3.11-slim

# Install system dependencies
# Naya (fixed)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py predict.py severity.py gradcam.py ./

# Copy model weights (backbone + all 6 heads)
COPY models/ ./models/

# Copy label maps (required at runtime)
COPY data/label_maps.json ./data/label_maps.json
COPY data/class_weights.json ./data/class_weights.json

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]