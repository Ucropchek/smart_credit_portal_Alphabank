FROM python:3.12-slim
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY src ./src
COPY sql ./sql
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src
EXPOSE 8000
CMD ["uvicorn", "smart_credit_ml.api:app", "--host", "0.0.0.0", "--port", "8000"]
