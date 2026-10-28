API setup:
1. Install Node.js from https://nodejs.org/
2. Open terminal in this folder and run: npm install
3. Copy .env.example to a file named .env
4. Put your secret key after OPENAI_API_KEY= in .env. Never put the key in HTML.
5. Run: npm start
6. Open: http://localhost:3000

The HTML calls /api/chat on the backend. Do not open the HTML using file://.
For mobile-only use, deploy this backend to a hosting service and set OPENAI_API_KEY as a secret environment variable.
API usage may require billing/credits. If the model is unavailable to your account, change OPENAI_MODEL to a model your API account supports.
