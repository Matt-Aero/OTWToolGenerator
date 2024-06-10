from flask import Blueprint, jsonify, request, render_template, session, redirect, url_for
import stripe
import os
from os import path, environ as env
from . import stripe_keys  # Ensure this is a valid relative import
import requests
from dotenv import load_dotenv, find_dotenv
import time

# Set up Stripe API key
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

payment = Blueprint('payment', __name__)
ENV_FILE = find_dotenv()
if ENV_FILE:
    load_dotenv(ENV_FILE)

@payment.route('/pricing')
def pricing():
    try:
        # Fetch the price from Stripe
        stripe_price_id = os.getenv('STRIPE_PRICE_ID')
        print(f"Stripe Price ID: {stripe_price_id}")
        price = stripe.Price.retrieve(stripe_price_id)
        price_amount = price['unit_amount'] / 100  # Convert to dollars
        print(f"Retrieved price amount: {price_amount}")
    except stripe.error.StripeError as e:
        price_amount = '--'
        print(f"Stripe error: {e.user_message}")
    except Exception as e:
        price_amount = '--'
        print(f"Unexpected error: {str(e)}")
    
    print(f"Price to be rendered: {price_amount}")
    return render_template('pricing.html', price=price_amount)

@payment.route('/api/get_subscription_status', methods=['GET'])
def get_subscription_status():
    subscription_status = session.get('userSubStatus', False)
    return jsonify({'subscription_status': subscription_status})

@payment.route("/create-checkout-session")
def create_checkout_session():

    YOUR_DOMAIN = os.getenv("DOMAIN_URL")
    stripe.api_key = stripe_keys["secret_key"]
    user_id = session.get('user_id')  # Get the user ID from the session
    
    try:
        checkout_session = stripe.checkout.Session.create(
            client_reference_id=user_id,  # Use the user ID from Auth0
            success_url=YOUR_DOMAIN + '/success',
            cancel_url=YOUR_DOMAIN + "/pricing",
            payment_method_types=["card"],
            customer_email=session['user_email'], # forcing the same email to be used across stripe / auth0 so we can sync customers
            mode="subscription",
            line_items=[
                {
                    "price": stripe_keys["price_id"],
                    "quantity": 1,
                }
            ],
            subscription_data={
                "metadata": {
                    'customer_id_stripe': user_id  # Store the user ID in metadata
                }
            }
        )

        return jsonify({"sessionId": checkout_session["id"]})
    except Exception as e:
        return jsonify(error=str(e)), 403

# Getting the key to send to the front end JS
@payment.route("/config")
def get_publishable_key():
    stripe_config = {"publicKey": stripe_keys["publishable_key"]}
    return jsonify(stripe_config)

# Add this route to handle the successful payment
@payment.route("/success")
def success():
    user_id = session.get("user_id")  # Assuming user_id is stored in the session
    update_user_role(user_id, 'Premium')

    # Redirect to the design page
    return redirect(url_for("views.design"))

# Function to update user roles
import os
import requests

def update_user_role(user_id, role):
    # Update user role in Auth0. 
    # Also updates the user's session variable for subscription status 
    # Accepts either "Premium", or "Free"
    # Get a management API Token for each call
    auth0_domain = os.getenv("AUTH0_DOMAIN")
    client_id = os.getenv("AUTH0_CLIENT_ID")
    client_secret = os.getenv("AUTH0_CLIENT_SECRET")
    audience = os.getenv("AUTH0_AUDIENCE")

    token_url = f"https://{auth0_domain}/oauth/token"
    token_payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "audience": audience,
        "grant_type": "client_credentials",
        "scope": "update:roles"  # Add necessary scopes
    }

    token_response = requests.post(token_url, json=token_payload)
    if token_response.status_code != 200:
        print(f"Failed to obtain access token: {token_response.text}")
        return f"Failed to obtain access token: {token_response.text}", 400

    token_data = token_response.json()
    #print("Token Response:", token_data)  # Debugging line
    access_token = token_data.get("access_token")

    if not access_token:
        return f"Failed to obtain access token: {token_data}", 400

    # Update the user's role to "Premium"
    user_roles_url = f"https://{auth0_domain}/api/v2/users/{user_id}/roles"
    headers = {
        "content-type": "application/json",
        "authorization": f"Bearer {access_token}"
    }
    # Debugging line to ensure correct role is set
    print(f"Setting role to {role} for user {user_id}")
    if role == "Premium":
        role_id = os.getenv("PREMIUM_ROLE_ID")
        payload = {"roles": [role_id]}  # Use the environment variable for the Premium role ID
        print(f"Payload for Premium: {payload}")
    else:
        role_id = os.getenv("FREE_ROLE_ID")
        payload = {"roles": [role_id]}  # Use the environment variable for the Free role ID
        print(f"Payload for Free: {payload}")
    role_response = requests.post(user_roles_url, json=payload, headers=headers)
    if role_response.status_code != 204:
        print(f"Failed to update user role: {role_response.text}")
        return f"Failed to update user role: {role_response.text}", 400

    # Set session status
    session['userSubStatus'] = True if role == "Premium" else False
    print(f"Updated user {user_id} to {role} role successfully")

    return True


# Link to stripe to manage user subscription status. For the user's to use
@payment.route('/create_customer_portal_session', methods=['POST'])
def create_customer_portal_session():
    try:
        customer_id = session.get('customer_id')
        if not customer_id:
            return jsonify({'message': 'Stripe ID not found in session'}), 400
        
        # Ensure the return URL is a fully qualified URL
        return_url = url_for('views.account_status', _external=True)
        if not return_url.startswith(('http://', 'https://')):
            return jsonify({'message': 'Return URL is not valid'}), 400

        # Create a billing portal session
        session_stripe = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return jsonify({'url': session_stripe.url})

    except stripe.error.StripeError as e:
        return jsonify({'message': f'Stripe error: {e.user_message}'}), 400

    except Exception as e:
        return jsonify({'message': f'An error occurred: {str(e)}'}), 500

# Check user subscription status
def updateSubscriptionStatus():
    # Checks the user's subscription status on the Stripe server and syncs the Auth0 server to it.
    user_id = session.get("user_id")  # Assuming user_id is stored in the session
    
    # Override to give premium access based on Auth0 metadata
    if session.get('premiumOverride') == True:
        update_user_role(user_id, "Premium")
        return True

    try:
        # Search for the User Subscription based on metadata of user_id
        query = f'metadata["customer_id_stripe"]:"{user_id}"'
        subscriptions = stripe.Subscription.search(query=query, limit=1)
        
        subscription = subscriptions['data'][0]
        session['customer_id'] = subscription['customer']  # setting the stripe customer ID
        session['cancel_at_period_end'] = subscription['cancel_at_period_end'] # Get true/false if the user has cancelled or not
        
        # Print subscription details for debugging
        print("Retrieving Subscription Status and Updating")
        print(f"Stripe Customer Id = {session['customer_id']}")
        print(f"cancel_at_period_end = {session['cancel_at_period_end']}")
        print(f"Subscription Status = {subscription['status']}")

        if not subscriptions['data']:
            return "No subscription found for user", 404
        subscription = subscriptions['data'][0]
        if subscription['status'] == 'active':
            # Update role to premium
            update_user_role(user_id, "Premium")
        else:
            # Update role to free
            update_user_role(user_id, "Free")

        # Calculate next bill date
        next_bill_date = subscription['current_period_end']
        session['next_bill_date'] = time.strftime('%Y-%m-%d', time.gmtime(next_bill_date))

    except stripe.error.StripeError as e:
        # Handle Stripe API errors
        return f"Stripe error: {e.user_message}", 400
    except Exception as e:
        # Handle any other exceptions
        return f"An error occurred: {str(e)}", 500

