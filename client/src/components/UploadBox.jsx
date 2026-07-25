import { useState, useRef } from 'react';

const UploadBox = ({ onFileSelect }) => {
  const [preview, setPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setPreview(URL.createObjectURL(file));
    onFileSelect(file);
  };

  const handleChange = (e) => {
    handleFile(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition
        ${dragActive ? 'border-green-600 bg-green-50' : 'border-gray-300 bg-white'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />

      {preview ? (
        <img src={preview} alt="Leaf preview" className="max-h-64 mx-auto rounded" />
      ) : (
        <div className="text-gray-500">
          <p className="text-lg mb-1">📷 Drag & drop a leaf image here</p>
          <p className="text-sm">or click to browse</p>
        </div>
      )}
    </div>
  );
};

export default UploadBox;