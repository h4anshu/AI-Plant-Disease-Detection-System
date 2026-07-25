import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import connectDB from './config/db.js';

const app = express();

// Connect to MongoDB
connectDB();

//Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/',(req, res) => {
    res.send("Plant Disease Detection API is running");
})


const PORT = process.env.PORT || 4000;

app.listen(PORT, () => console.log(`Server is Running on port : ${PORT}`));
