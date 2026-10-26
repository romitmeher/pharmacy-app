FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOME=/home/app \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True OMP_NUM_THREADS=4 OCR_ENABLE_MKLDNN=false SMARTPHARM_DATA_DIR=/app/data
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libzbar0 libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements-cloud.txt ./
RUN pip install --no-cache-dir -r requirements-cloud.txt
RUN useradd --create-home --uid 10001 app
COPY --chown=app:app app ./app
COPY --chown=app:app migrations ./migrations
COPY --chown=app:app run.py cloud_entrypoint.py ./
RUN mkdir -p /app/data /app/instance && chown -R app:app /app/data /app/instance
USER app
# Cache the small OCR weights in the image, so first requests do not download them.
RUN python -c "import cv2, numpy as np; from app.vision.ocr_engine import default_ocr_engine; image=np.full((350,800,3),255,np.uint8); cv2.putText(image,'Paracetamol 500 mg',(30,160),cv2.FONT_HERSHEY_SIMPLEX,1.5,(0,0,0),3); result=default_ocr_engine.run_ocr(image); assert 'paracetamol' in result.full_text.lower(), 'OCR inference smoke test failed'"
EXPOSE 8080
CMD ["python", "cloud_entrypoint.py"]
