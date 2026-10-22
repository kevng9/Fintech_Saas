# The deterministic simulator: seeder, event stream, scenario injection, reset.
#
# Build context is the repository root, because the simulator reads the SQL
# migrations from database/ and writes the recorded baseline to fixtures/.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /demo

COPY simulator/requirements.txt simulator/requirements.txt
RUN pip install --no-cache-dir -r simulator/requirements.txt

COPY database/ database/
COPY simulator/ simulator/

# The package resolves the repository root relative to its own location, so it
# runs from inside simulator/.
WORKDIR /demo/simulator

# Runs as a non-root user: this process holds database credentials and needs no
# privileges beyond an outbound connection.
RUN useradd --create-home --uid 10001 demo && chown -R demo:demo /demo
USER demo

ENTRYPOINT ["python", "-m", "fintech_demo"]
CMD ["run"]
