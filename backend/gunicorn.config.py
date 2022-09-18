# https://docs.gunicorn.org/en/latest/settings.html
pythonpath = "./"
workers = 2

# set UvicornWorker(uvicorn requires)
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:80"

# filename
pidfile = "prod.pid"

# environment values
raw_env = ["MODE=PROD"]

proc_name = "fastapi_app"
