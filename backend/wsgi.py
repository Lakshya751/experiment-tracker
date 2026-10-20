"""Entry point used by `flask --app wsgi run` and `flask --app wsgi db ...`."""
from app import create_app

app = create_app()
