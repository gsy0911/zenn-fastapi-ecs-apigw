FROM python:3.9-buster

WORKDIR /opt/app
RUN pip install -U pip poetry
COPY pyproject.toml .
COPY poetry.lock .

RUN poetry config virtualenvs.in-project true && \
    poetry install --no-dev --no-interaction

ENV PATH=/opt/app/.venv/bin:$PATH
COPY backend /opt/app/src

WORKDIR /opt/app/src
CMD ["python", "-m", "gunicorn", "-c", "gunicorn.config.py", "main:app"]
