# Biodiversity Project

This is a Flask-based web application for managing biodiversity contributions. It includes user authentication, contribution management, and administrative functionalities, including a chat feature powered by the Gemini API and a quality evaluation tool for contributions.

## Features

- User Registration and Authentication
- Create, Read, Update, and Delete Biodiversity Contributions
- Admin Panel for User and Contribution Management
- AI-powered Chatbot (Gemini 2.5 Flash) for biodiversity queries
- AI-powered Contribution Quality Evaluation

## Setup Instructions

Follow these steps to set up and run the project locally:

### 1. Clone the Repository (if applicable)

If you haven't already, clone the project repository:

```bash
git clone https://github.com/abhinavgautam08/Biodiversity-Mapping.git
cd Biodiversity
```

### 2. Create a Virtual Environment

It's recommended to use a virtual environment to manage project dependencies.

```bash
python3 -m venv venv
```

### 3. Activate the Virtual Environment

- **On macOS/Linux:**
  ```bash
  source venv/bin/activate
  ```
- **On Windows:**
  ```bash
  .\venv\Scripts\activate
  ```

### 4. Install Dependencies

Install the required Python packages using `pip`:

```bash
pip install -r requirements.txt
```

### 5. Environment Variables

Create a `.env` file in the root directory of the project and add the following environment variables:

```env
SECRET_KEY='your_secret_key_here' # Change this to a strong, random key
DATABASE_URL='sqlite:///biodiversity.db' # Or your preferred database URL
GEMINI_API_KEY='your_gemini_api_key_here' # Required for chat and quality evaluation features
ADMIN_EMAIL='admin@example.com' # Optional: Email for the bootstrapped admin account
```

- **`SECRET_KEY`**: A secret key for Flask sessions.
- **`DATABASE_URL`**: The database connection string. By default, it uses a SQLite database named `biodiversity.db`.
- **`GEMINI_API_KEY`**: Your API key for the Google Gemini API. Obtain one from [Google AI Studio](https://aistudio.google.com/). This is required for the chat and contribution quality evaluation features.
- **`ADMIN_EMAIL`**: (Optional) If set, this email will be used to prevent revoking admin status for the bootstrapped admin account.

### 6. Initialize the Database

The database will be initialized automatically when you run the application for the first time. If you need to re-initialize or create a fresh database, you can delete the `instance/biodiversity.db` file (or your configured database file) and restart the application.

### 7. Run the Application

Once the setup is complete, you can run the Flask application:

```bash
python app.py
```

The application will typically run on `http://localhost:5001`. Open this URL in your web browser to access the application.

### 8. Deactivate the Virtual Environment

When you're done working on the project, you can deactivate the virtual environment:

```bash
deactivate
```# Biodiversity-Mapping
# Biodiversity-Mapping
# Biodiversity-Mapping
# Biodiversity-Mapping
