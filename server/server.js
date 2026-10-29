import 'dotenv/config';
import connectDB from './config/db.js';
import app from './app.js';

// Fail fast on a missing setting instead of failing on the first user request (see .env.example)
const required = ['MONGODB_URI', 'FASTAPI_URL', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
if (process.env.NODE_ENV === 'production') required.push('CLIENT_ORIGINS', 'ML_SERVICE_TOKEN');
// field health is optional; once its service is configured, it needs its secret too
if (process.env.NODE_ENV === 'production' && process.env.GEO_SERVICE_URL) required.push('GEO_SERVICE_TOKEN');
// Tokens are signed with JWT_SECRET: a short one can be guessed offline from any token
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET must be at least 32 characters (docs/AUTH.md)');
    process.exit(1);
}
const missing = required.filter((name) => !process.env[name]);
// Fusion only ever runs offline (scripts/eval_fusion.js); production explains, it never re-ranks (docs/CONTEXT_LAYER.md)
if (process.env.NODE_ENV === 'production' && (process.env.FUSION_MODE ?? 'explain') !== 'explain') {
    console.error('FUSION_MODE must be "explain" in production');
    process.exit(1);
}
if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')} (see server/.env.example)`);
    process.exit(1);
}

// Connect to MongoDB
connectDB();

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => console.log(`Server is Running on port : ${PORT}`));
