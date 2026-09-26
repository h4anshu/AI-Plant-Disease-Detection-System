import express from 'express';
import cors from 'cors';
import multer from 'multer';
import authRouter from './routes/auth.routes.js';
import predictRouter from './routes/predict.routes.js';

// The Express app without side effects (no DB connection, no listen) so tests can import it;
// server.js connects to MongoDB and starts listening.
const app = express();

//Middleware
app.use(cors());
app.use(express.json());

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
    console.error('Unhandled error:', err.message);
    res.status(500).json({ message: 'Something went wrong' });
});

export default app;
