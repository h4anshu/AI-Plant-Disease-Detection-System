import jwt from 'jsonwebtoken';

const authMiddleware = (req, res , next) => {
    const token = req.headers.authorization;

    // ponytail: login temporarily disabled, so requests arrive with no token — use a guest user
    // instead of rejecting. Restore the original 401 below once login is back on.
    if(!token){
        req.user = { id: '000000000000000000000000' }; // valid ObjectId format for the guest placeholder
        return next();
        // return res.status(401).json({message : 'No token provided, authorization denied'});
    }

    try {

        const decode = jwt.verify(token , process.env.JWT_SECRET);
        req.user = decode;
        next();
        
    } catch (error) {
        return res.status(401).json({ message: 'Token is invalid or expired' });

    }
}

export default authMiddleware;