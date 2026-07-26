import jwt from 'jsonwebtoken';

const authMiddleware = (req, res , next) => {
    const token = req.headers.authorization;

    if(!token){
        return res.status(401).json({message : 'No token provided, authorization denied'});
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