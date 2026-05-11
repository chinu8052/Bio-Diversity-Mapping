import os
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    name = db.Column(db.String(64))
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.String(30), nullable=False)

    def __repr__(self):
        return f'<User {self.email}>'

class Contribution(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.String(30), nullable=False)
    updated_at = db.Column(db.String(30), nullable=False)

    user = db.relationship('User', backref=db.backref('contributions', lazy=True, cascade="all, delete"))

    def __repr__(self):
        return f'<Contribution {self.title}>'

def init_db(app):
    with app.app_context():
        db.create_all()
        admin_email = os.environ.get('ADMIN_EMAIL')
        admin_password = os.environ.get('ADMIN_PASSWORD')
        if admin_email and admin_password:
            email = (admin_email or '').strip().lower()
            existing = User.query.filter_by(email=email).first()
            if not existing:
                new_user = User(
                    email=email,
                    password_hash=generate_password_hash(admin_password),
                    name='Admin',
                    is_admin=True,
                    created_at=datetime.utcnow().isoformat(),
                )
                db.session.add(new_user)
                db.session.commit()
