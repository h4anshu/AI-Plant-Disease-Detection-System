import 'dotenv/config';
import connectDB from './config/db.js';
import app from './app.js';

// Fail fast on a missing setting instead of failing on the first user request (see .env.example)
const required = ['MONGODB_URI', 'FASTAPI_URL', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
if (process.env.NODE_ENV === 'production') required.push('CLIENT_ORIGINS', 'ML_SERVICE_TOKEN');
// field health is optional; once its service is configured, it needs its secret too
if (process.env.NODE_ENV === 'production' && process.env.GEO_SERVICE_URL) required.push('GEO_SERVICE_TOKEN');
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')} (see server/.env.example)`);
    process.exit(1);
}

// Connect to MongoDB
connectDB();

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => console.log(`Server is Running on port : ${PORT}`));
