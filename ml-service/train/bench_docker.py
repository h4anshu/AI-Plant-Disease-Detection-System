"""Benchmark a built ML-service image (docs/SERVING.md): size, cold start, RAM, request latency.

    python train/bench_docker.py plant-ml:onnx [--cpus 2 --memory 4g]

Runs the container with fixed CPU/memory limits (like a small scale-to-zero instance), measures time
from `docker run` to the first healthy /health and to the first successful prediction, then 60
sequential /predict-disease requests over the 10 golden fixtures, and the container RAM after them.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import httpx
import numpy as np

TESTS = Path(__file__).resolve().parents[1] / "tests"


def sh(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--cpus", default="2")
    ap.add_argument("--memory", default="4g")
    ap.add_argument("--port", default="8765")
    ap.add_argument("--requests", type=int, default=60)
    ap.add_argument("--crops", help="comma list; default all golden fixtures (the pre-ONNX image only knows 6 crops)")
    a = ap.parse_args()
    golden = json.loads((TESTS / "golden_expected.json").read_text(encoding="utf-8"))
    fixtures = [(crop, (TESTS / "fixtures" / "golden" / e["file"]).read_bytes()) for crop, e in golden.items()
                if not a.crops or crop in a.crops.split(",")]
    size_mb = int(sh("docker", "image", "inspect", a.image, "--format", "{{.Size}}")) / 1e6
    url = f"http://127.0.0.1:{a.port}"

    t0 = time.perf_counter()
    cid = sh("docker", "run", "-d", "--rm", f"--cpus={a.cpus}", f"--memory={a.memory}", "-p", f"{a.port}:8000", a.image)
    try:
        with httpx.Client(timeout=120) as client:
            while True:
                try:
                    if client.get(f"{url}/health").status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                time.sleep(0.1)
            t_health = time.perf_counter() - t0
            crop, raw = fixtures[0]
            r = client.post(f"{url}/predict-disease", data={"crop": crop}, files={"file": ("leaf.jpg", raw, "image/jpeg")})
            r.raise_for_status()
            t_first = time.perf_counter() - t0
            lat = []
            for i in range(a.requests):
                crop, raw = fixtures[i % len(fixtures)]
                t = time.perf_counter()
                r = client.post(f"{url}/predict-disease", data={"crop": crop}, files={"file": ("leaf.jpg", raw, "image/jpeg")})
                r.raise_for_status()
                lat.append((time.perf_counter() - t) * 1000)
        mem = sh("docker", "stats", "--no-stream", "--format", "{{.MemUsage}}", cid).split("/")[0].strip()
    finally:
        subprocess.run(["docker", "stop", cid], capture_output=True)
    lat = np.array(lat)
    out = {"image": a.image, "image_size_mb": round(size_mb), "limits": f"{a.cpus} CPU, {a.memory}",
           "cold_start_to_health_s": round(t_health, 1), "cold_start_to_first_prediction_s": round(t_first, 1),
           "ram_after_warmup": mem, "latency_p50_ms": round(float(np.median(lat))),
           "latency_p95_ms": round(float(np.quantile(lat, 0.95))), "requests": a.requests,
           "crops": [c for c, _ in fixtures]}
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
