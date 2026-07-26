import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserModel from "../models/User.js";


const register = async(req , res) => {
    try {

        const { name ,email , password} = req.body;

        if(!name || !email || !password){
            return res.status(400).json({ message: 'Please provide name, email, and password' });
        }

        const existingUser = await UserModel.findOne({email});
        if(existingUser){
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password , salt);

        const user = await UserModel.create({
            name:name,
            email:email,
            passwordHash:passwordHash
        })

        const token = jwt.sign({id:user._id , email:user.email} , process.env.JWT_SECRET, {expiresIn: '7d'});

        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email }

    });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}


const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


export {register , login};