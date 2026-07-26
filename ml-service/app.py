from fastapi import FastAPI

app = FastAPI(title="Plant Disease Detection ML Service")


@app.get("/health")
def health():
    return {"status": "ok"}
