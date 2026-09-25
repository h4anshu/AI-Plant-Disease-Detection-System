import express from "express"
import { register , login} from "../controllers/authController.js";

const authRouter = express.Router();

// ponytail: email/password auth temporarily disabled, remove this block to re-enable
const disabled = (req, res) => res.status(503).json({ message: "Email/password login is temporarily disabled" });
authRouter.post('/register' , disabled);
authRouter.post('/login' , disabled);
// authRouter.post('/register' , register);
// authRouter.post('/login' , login);

export default authRouter;


