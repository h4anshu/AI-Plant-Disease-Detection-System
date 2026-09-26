import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload a Buffer, resolve to its https URL
export const uploadBuffer = (buffer, folder) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder },
    (error, result) => (error ? reject(error) : resolve(result.secure_url))
  );
  stream.end(buffer);
});

// https://res.cloudinary.com/<cloud>/image/upload/v123/plant-disease/abc.jpg -> "plant-disease/abc";
// anything else (old base64 heatmaps, demo placeholders) -> null
export const publicIdFromUrl = (url) =>
  (typeof url === 'string' && url.match(/\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i)?.[1]) || null;

export default cloudinary;
