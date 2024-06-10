from flask import Blueprint, render_template, request, flash, redirect, url_for, session, jsonify
from authlib.integrations.flask_client import OAuth
import json
from os import environ as env
from urllib.parse import quote_plus, urlencode
from . import oauth  # Import the initialized oauth object from __init__.py
from jose import jwt
from .payment import updateSubscriptionStatus
 
auth = Blueprint('auth', __name__)  # blueprints are useful for splitting out routes into different Python files

# Auth0 routes
@auth.route("/login")
def login():
    return oauth.auth0.authorize_redirect(
        redirect_uri=url_for("auth.callback", _external=True),
        audience=env.get("AUTH0_AUDIENCE") # Include the audience parameter which connects to the right api
    )

@auth.route("/callback", methods=["GET", "POST"])
def callback():
    # Getting Newest Basic User Data From the Database
    token = oauth.auth0.authorize_access_token()
    session["user"] = token
    user_info = token.get('userinfo')
    session['user_email'] = user_info.get('email') if user_info else None
    session['nickname'] = user_info.get('nickname') if user_info else None
    session['user_id'] = user_info.get('sub') # this should be used as a unique identifier for each user of the site. Same value for stripe id. Note that users without having made a stripe purchase (yet) still have a value here
    session['email_verified'] = user_info.get('email_verified')
    
    print(session['email_verified'])
    print(user_info)
    session['premiumOverride'] = user_info.get('premiumOverride') if user_info else None
    
    ## Access token decoding
    # access_token = session.get('user', {}).get('access_token')
    #access_token_decoded = decode_user(access_token)
    #permissions = access_token_decoded.get('permissions', [])

    print("divider----")
    print(session['premiumOverride'])
 
    # Update User Subscription Status
    updateSubscriptionStatus() # checking stripe server for subscription status
    user_sub_status = session.get('userSubStatus', False)  # Default to False if not set
    print("User Subscription Status (on login): " + str(user_sub_status))

    if session['email_verified'] == False:
        return redirect(url_for('verify_email'))

    return redirect("/")

@auth.route('/verifyEmail')
def verifyEmail():
    # Ensure the user is logged in and has an email address in the session
    if 'user_email' in session:
        return render_template('verifyEmail.html')
    else:
        return "Unauthorized", 401

@auth.route("/logout")
def logout():
    session.clear()
    return redirect(
        "https://" + env.get("AUTH0_DOMAIN")
        + "/v2/logout?"
        + urlencode(
            {
                "returnTo": url_for("auth.home", _external=True),
                "client_id": env.get("AUTH0_CLIENT_ID"),
            },
            quote_via=quote_plus,
        )
    )

@auth.route("/")
def home():
    return render_template("index.html", session=session.get('user'), pretty=json.dumps(session.get('user'), indent=4))

# Setting user permissions to none if they are not signed in
@auth.before_app_request
def set_default_permissions():
    if 'user' not in session:
        session['permissions'] = ["none"]
    #print(session['permissions']) #it works!

# endpoint for getting user permissions. Used for the Javascript
@auth.route('/api/get_subscription_status', methods=['GET'])
def get_subscription_status():
    subscription_status = session.get('userSubStatus', False)
    return jsonify({'subscription_status': subscription_status})

## Access Code Decoding
def decode_user(token: str):
    """
    Decode a JWT token without verifying its signature
    
    :param token: JWT token
    :return: Decoded token data
    """
    try:
        # Decode the token without verifying the signature
        decoded_data = jwt.decode(token, "dummy_key", options={"verify_signature": False, "verify_aud": False})
        
        return decoded_data
    except Exception as e:
        print(f"Unable to decode token: {str(e)}")
        return None, []
