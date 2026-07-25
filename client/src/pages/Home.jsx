import React from 'react'
import { AuthContext } from '../context/AuthContext'
import { useContext } from 'react'
import { Link } from 'react-router-dom';
const Home = () => {

  const { isAuthenticated } = useContext(AuthContext);
  return (
    <div className="flex flex-col items-center justify-center text-center mt-24 px-4">
      <h1 className="text-4xl font-bold text-green-800 mb-4">
        🌿 AI Plant Disease Detection
      </h1>
      <p className="text-gray-600 max-w-xl mb-8">
        Upload a photo of your crop's leaf and get an instant disease diagnosis,
        severity level, treatment advice, and estimated yield impact — powered by AI.
      </p>

      <Link
        to={isAuthenticated ? '/predict' : '/register'}
        className="bg-green-700 text-white px-6 py-3 rounded-lg text-lg hover:bg-green-800"
      >
        Try it now
      </Link>
    </div>
  );
};


export default Home
