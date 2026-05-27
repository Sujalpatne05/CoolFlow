import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadBase64Image(base64String, folder = 'logdine') {
  if (!base64String || !base64String.startsWith('data:')) {
    return base64String; // already a URL, return as-is
  }
  try {
    const result = await cloudinary.uploader.upload(base64String, {
      folder,
      resource_type: 'image',
    });
    return result.secure_url;
  } catch (err) {
    console.error('[CLOUDINARY] Upload error:', err.message);
    return base64String; // fallback to original
  }
}

export default cloudinary;
