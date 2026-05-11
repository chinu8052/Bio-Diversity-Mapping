import os
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime
from typing import Optional

from flask import Flask, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
import google.generativeai as genai
import json
from models import db, User, Contribution, init_db

if os.environ.get('GEMINI_API_KEY'):
    genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))

app = Flask(__name__, static_folder='.', static_url_path='')

@app.route('/')
def index():
    return app.send_static_file('index.html')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False  # set True when using HTTPS

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///biodiversity.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Helpers

def normalize_email(email: str) -> str:
    return (email or '').strip().lower()


def sanitize_user(user) -> dict:
    if not user:
        return None
    return {
        'id': user.id,
        'email': user.email,
        'name': user.name,
        'created_at': user.created_at,
        'is_admin': bool(user.is_admin),
        'contribution_count': len(user.contributions),
    }


def sanitize_contribution(contribution) -> dict:
    if not contribution:
        return None
    return {
        'id': contribution.id,
        'user_id': contribution.user_id,
        'title': contribution.title,
        'content': contribution.content,
        'created_at': contribution.created_at,
        'updated_at': contribution.updated_at,
        'user_email': contribution.user.email, # Include user email for display
    }


def fetch_user_by_email(email: str):
    return User.query.filter_by(email=email).first()


def fetch_user_by_id(user_id: int):
    return User.query.get(user_id)


def create_user(email: str, password: str, name: Optional[str], is_admin: bool = False):
    new_user = User(
        email=email,
        password_hash=generate_password_hash(password),
        name=name,
        is_admin=bool(is_admin),
        created_at=datetime.utcnow().isoformat(),
    )
    db.session.add(new_user)
    db.session.commit()
    return new_user.id


def require_admin():
    user_id = session.get('user_id')
    if not user_id:
        return None
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return None
    return user


# API Endpoints

@app.post('/api/register')
def api_register():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    password = (data.get('password') or '').strip()
    name = (data.get('name') or '').strip() or None

    if not email or '@' not in email:
        return jsonify({'error': 'Valid email required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    if fetch_user_by_email(email) is not None:
        return jsonify({'error': 'Email is already registered'}), 409

    user_id = create_user(email, password, name)
    session['user_id'] = user_id
    user = fetch_user_by_id(user_id)
    return jsonify({'user': sanitize_user(user)}), 201


@app.post('/api/login')
def api_login():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    password = (data.get('password') or '').strip()

    user = fetch_user_by_email(email)
    if user is None or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid email or password'}), 401

    session['user_id'] = user.id
    user = fetch_user_by_id(user.id)
    return jsonify({'user': sanitize_user(user)})


@app.get('/api/me')
def api_me():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'user': None}), 200
    user = fetch_user_by_id(int(user_id))
    return jsonify({'user': sanitize_user(user)})


@app.post('/api/logout')
def api_logout():
    session.clear()
    return jsonify({'ok': True})


from flask_graphql import GraphQLView
from schema import schema

# Admin endpoints
@app.get('/api/admin/users')
def admin_list_users():
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Forbidden'}), 403
    users = [sanitize_user(u) for u in User.query.order_by(User.created_at.desc()).all()]
    return jsonify({'users': users})


@app.post('/api/admin/users')
def admin_create_user():
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    password = (data.get('password') or '').strip()
    name = (data.get('name') or '').strip() or None
    is_admin = bool(data.get('is_admin'))

    if not email or '@' not in email:
        return jsonify({'error': 'Valid email required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    if fetch_user_by_email(email) is not None:
        return jsonify({'error': 'Email is already registered'}), 409

    try:
        user_id = create_user(email, password, name, is_admin)
        user = fetch_user_by_id(user_id)
        return jsonify({'user': sanitize_user(user)}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.post('/api/admin/users/<user_id>/set_admin')
def admin_set_admin(user_id):
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json(silent=True) or {}
    is_admin = bool(data.get('is_admin'))
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'Invalid user id'}), 400

        # Prevent revoking admin status for the bootstrapped admin account
        bootstrapped_admin_email = os.environ.get('ADMIN_EMAIL')
        if bootstrapped_admin_email and user.email == bootstrapped_admin_email and not is_admin:
            return jsonify({'error': 'Cannot revoke admin status for the bootstrapped admin account'}), 400

        user.is_admin = is_admin
        db.session.commit()
    except Exception:
        return jsonify({'error': 'Invalid user id'}), 400
    return jsonify({'ok': True})

@app.route('/ql', methods=['GET', 'POST'])
def graphql_view():
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Forbidden'}), 403
    return GraphQLView.as_view('graphql', schema=schema, graphiql=True)()

# Chat endpoint using Gemini 1.5 Flash
@app.post('/api/chat')
def api_chat():
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return jsonify({'error': 'Chat not configured'}), 503
    data = request.get_json(silent=True) or {}
    user_message = (data.get('message') or '').strip()
    if not user_message:
        return jsonify({'error': 'Message required'}), 400
    try:
        model = genai.GenerativeModel('gemini-2.5-flash', system_instruction='You are a biodiversity expert. Provide concise, practical answers about species, habitats, conservation, and identification. Ask clarifying questions when needed.')
        resp = model.generate_content(user_message)
        text = getattr(resp, 'text', None) or (resp.candidates[0].content.parts[0].text if getattr(resp, 'candidates', None) else '')
        return jsonify({'reply': text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.post('/api/admin/users/<user_id>/delete')
def admin_delete_user(user_id):
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Forbidden'}), 403
    # prevent deleting self
    if str(admin.id) == user_id:
        return jsonify({'error': "You can't delete your own account"}), 400
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'Invalid user id'}), 400
        db.session.delete(user)
        db.session.commit()
    except Exception:
        return jsonify({'error': 'Invalid user id'}), 400
    return jsonify({'ok': True})


# Contribution Endpoints
@app.post('/api/contributions')
def api_create_contribution():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()

    if not title or not content:
        return jsonify({'error': 'Title and content are required'}), 400

    new_contribution = Contribution(
        user_id=user_id,
        title=title,
        content=content,
        created_at=datetime.utcnow().isoformat(),
        updated_at=datetime.utcnow().isoformat(),
    )
    db.session.add(new_contribution)
    db.session.commit()
    return jsonify({'contribution': sanitize_contribution(new_contribution)}), 201

@app.get('/api/contributions')
def api_list_contributions():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401
    
    contributions = [sanitize_contribution(c) for c in Contribution.query.filter_by(user_id=user_id).order_by(Contribution.created_at.desc()).all()]
    return jsonify({'contributions': contributions})

@app.get('/api/contributions/<int:contribution_id>')
def api_get_contribution(contribution_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401
    
    contribution = Contribution.query.filter_by(id=contribution_id, user_id=user_id).first()
    if not contribution:
        return jsonify({'error': 'Contribution not found'}), 404
    return jsonify({'contribution': sanitize_contribution(contribution)})

@app.put('/api/contributions/<int:contribution_id>')
def api_update_contribution(contribution_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401

    contribution = Contribution.query.get(contribution_id)
    if not contribution:
        return jsonify({'error': 'Contribution not found'}), 404

    # Check if user is owner or admin
    user = fetch_user_by_id(user_id)
    if not user or (contribution.user_id != user.id and not user.is_admin):
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()

    if not title or not content:
        return jsonify({'error': 'Title and content are required'}), 400

    contribution.title = title
    contribution.content = content
    contribution.updated_at = datetime.utcnow().isoformat()
    db.session.commit()
    return jsonify({'contribution': sanitize_contribution(contribution)})

@app.delete('/api/contributions/<int:contribution_id>')
def api_delete_contribution(contribution_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Authentication required'}), 401

    contribution = Contribution.query.get(contribution_id)
    if not contribution:
        return jsonify({'error': 'Contribution not found'}), 404

    # Check if user is owner or admin
    user = fetch_user_by_id(user_id)
    if not user or (contribution.user_id != user.id and not user.is_admin):
        return jsonify({'error': 'Forbidden'}), 403

    db.session.delete(contribution)
    db.session.commit()
    return jsonify({'ok': True})


@app.get('/api/admin/contributions')
def admin_list_contributions():
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Forbidden'}), 403
    
    contributions = Contribution.query.join(User).order_by(Contribution.created_at.desc()).all()
    result = []
    for c in contributions:
        contrib_data = sanitize_contribution(c)
        contrib_data['user_name'] = c.user.name or c.user.email
        contrib_data['user_email'] = c.user.email
        result.append(contrib_data)
    
    return jsonify({'contributions': result})


@app.post('/api/admin/contributions/evaluate_quality')
def admin_evaluate_contribution_quality():
    admin = require_admin()
    if not admin:
        return jsonify({'error': 'Forbidden'}), 403

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return jsonify({'error': 'Gemini API key not configured'}), 503

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        contributions = Contribution.query.all()
        results = []

        for contribution in contributions:
            prompt = f"""Evaluate the following biodiversity contribution for its detail and comprehensiveness. Assign a score from 1 to 10, where 1 is very poor and 10 is excellent. Also, provide a brief justification for the score.

Contribution Title: {contribution.title}
Contribution Content: {contribution.content}

Format your response as a JSON object with 'score' (integer) and 'justification' (string) fields."""
            
            response = model.generate_content(prompt)
            
            # Extract text from the response, handling potential variations
            try:
                ai_text = getattr(response, 'text', None) or (response.candidates[0].content.parts[0].text if getattr(response, 'candidates', None) else '')
                ai_evaluation = json.loads(ai_text)
            except (json.JSONDecodeError, AttributeError, IndexError) as e:
                ai_evaluation = {'score': 0, 'justification': f'Error parsing AI response: {e}'}

            results.append({
                'contribution_id': contribution.id,
                'user_id': contribution.user_id,
                'title': contribution.title,
                'score': ai_evaluation.get('score'),
                'justification': ai_evaluation.get('justification'),
            })
        return jsonify({'evaluations': results})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    init_db(app)
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5001)), debug=True)
