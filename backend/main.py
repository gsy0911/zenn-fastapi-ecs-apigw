from logging import getLogger, INFO
from fastapi import FastAPI

app = FastAPI()
logger = getLogger(__name__)
logger.setLevel(INFO)


@app.get("/")
def root():
    logger.info("/")
    return {"msg": "Hello, World"}


@app.post("/item")
def item_post():
    return {"msg": "post-item"}


@app.get("/item")
def item_get():
    return {"msg": "get-item"}


@app.delete("/item")
def item_delete():
    return {"msg": "delete-item"}


@app.put("/item")
def item_put():
    return {"msg": "put-item"}
