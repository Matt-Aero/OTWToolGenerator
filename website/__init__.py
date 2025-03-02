from flask import Flask, session
from flask_sqlalchemy import SQLAlchemy
from os import path, environ as env
import tempfile
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv, find_dotenv
import stripe
import os

ENV_FILE = find_dotenv()
if ENV_FILE:
    load_dotenv(ENV_FILE)

oauth = OAuth()

stripe_keys = {
    "secret_key": os.getenv("STRIPE_SECRET_KEY"),
    "publishable_key": os.getenv("STRIPE_PUBLISHABLE_KEY"),
    "price_id": os.getenv("STRIPE_PRICE_ID"),  # new
}
stripe.api_key = stripe_keys["secret_key"]

def create_app():
    app = Flask(__name__)
    app.secret_key = env.get("APP_SECRET_KEY")
    app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()
    app.config['GENERATED_FOLDER'] = tempfile.gettempdir()
    app.config['MAX_CONTENT_LENGTH'] = 100 * 1000 * 1000  # max file size of 100mb

    from .views import views
    from .auth import auth
    from .payment import payment  # Add this line
    app.register_blueprint(views, url_prefix='')
    app.register_blueprint(auth, url_prefix='')
    app.register_blueprint(payment, url_prefix='')  # Add this line

    oauth.init_app(app)
    oauth.register(
        "auth0",
        client_id=env.get("AUTH0_CLIENT_ID"),
        client_secret=env.get("AUTH0_CLIENT_SECRET"),
        client_kwargs={"scope": "openid profile email"},
        server_metadata_url=f'https://{env.get("AUTH0_DOMAIN")}/.well-known/openid-configuration'
    )

    return app
