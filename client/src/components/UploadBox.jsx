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
      className={`border-2 border-dashed p-10 text-center cursor-pointer transition-colors
        ${dragActive ? 'border-field bg-field/5' : 'border-ink/25 bg-transparent hover:border-ink/40'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />

      {preview ? (
        <img src={preview} alt="Leaf preview" className="max-h-64 mx-auto border border-ink/10" />
      ) : (
        <div>
          <p className="font-display text-xl text-ink/70 italic mb-1">Place the leaf here</p>
          <p className="font-mono text-xs text-sage uppercase tracking-widest">
            drag & drop, or click to browse
          </p>
        </div>
      )}
    </div>
  );
};

export default UploadBox;