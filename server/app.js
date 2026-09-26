import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import authRouter from './routes/auth.routes.js';
import predictRouter from './routes/predict.routes.js';
import { globalLimiter } from './middleware/rateLimit.js';

// The Express app without side effects (no DB connection, no listen) so tests can import it;
// server.js connects to MongoDB and starts listening.
const app = express();

// Cloud Run's front end is the one proxy in front of us: take the client IP (for rate limits) from it
app.set('trust proxy', 1);

//Middleware
app.use(helmet());
// Only the listed browser origins may call the API; unset (local dev, tests) = any origin
const origins = process.env.CLIENT_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origins?.length ? origins : true }));
app.use(globalLimiter);
app.use(express.json({ limit: '10kb' }));

// Routes
app.get('/',(req, res) => {
    res.send("Plant Disease Detection API is running");
})

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
})

app.use('/api/auth', authRouter);
app.use('/api/predict', predictRouter);

// Upload problems (non-image file, file too large) are the client's fault: 400, not Express's default 500 page
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message === 'Only image files are allowed') {
        return res.status(400).json({ message: err.message });
    }
    if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
        return res.status(err.status).json({ message: 'Invalid request body' });
    }
    console.error('Unhandled error:', err.message);
    res.status(500).json({ message: 'Something went wrong' });
});

export default app;
