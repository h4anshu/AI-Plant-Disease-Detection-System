import express from "express"
import { register, login, me, deleteAccount, guestData, claimGuest } from "../controllers/authController.js";
import authMiddleware, { requireUser } from "../middleware/auth.js";
import { accountLimiter, loginLimiter, registerLimiter } from "../middleware/rateLimit.js";

const authRouter = express.Router();

authRouter.post('/register', registerLimiter, register);
authRouter.post('/login', loginLimiter, login);
authRouter.get('/me', authMiddleware, requireUser, me);
authRouter.delete('/me', accountLimiter, authMiddleware, requireUser, deleteAccount);
authRouter.get('/guest-data', authMiddleware, requireUser, guestData);
authRouter.post('/claim-guest', authMiddleware, requireUser, claimGuest);

export default authRouter;
