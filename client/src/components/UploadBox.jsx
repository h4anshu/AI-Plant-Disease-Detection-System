import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from './heroIcons';

// The leaf photo step: a drop area with "Take a photo" (opens the phone camera) and "Choose a file"
const UploadBox = ({ onFileSelect }) => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);
  const cameraRef = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setPreview(URL.createObjectURL(file));
    setName(file.name);
    onFileSelect(file);
  };
  const pick = (ref) => (e) => { e.stopPropagation(); ref.current.click(); };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" onChange={(e) => handleFile(e.target.files[0])} className="hidden" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleFile(e.target.files[0])} className="hidden" />
      {preview ? (
        <div className="flex items-center gap-4 rounded-2xl border border-ink/15 bg-white/60 p-3.5">
          <img src={preview} alt={t('upload.previewAlt')} className="h-[130px] w-[150px] shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{name}</p>
            <p className="mt-2 text-[13px] text-ink-2">{t('ws.check.resized')}</p>
            <button type="button" onClick={pick(inputRef)} className="mt-1 min-h-[44px] text-sm font-semibold text-pine underline underline-offset-4">{t('ws.check.replace')}</button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files[0]); }}
          className={`flex flex-col items-center gap-3.5 rounded-[18px] border-2 border-dashed px-5 py-8 text-center transition-colors ${dragActive ? 'border-pine bg-sage-wash' : 'border-ink/30 bg-white/40'}`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-pine text-parchment"><Camera className="h-7 w-7" /></span>
          <p className="font-display text-[1.35rem] italic text-ink-2">{t('upload.placeHere')}</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button type="button" onClick={pick(cameraRef)} className="ws-btn">{t('ws.check.take')}</button>
            <button type="button" onClick={pick(inputRef)} className="ws-btn ws-btn-ghost">{t('ws.check.choose')}</button>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2 max-lg:hidden">{t('ws.check.dragHint')}</p>
        </div>
      )}
      <ul aria-label={t('ws.check.tipsAria')} className="mt-3 flex flex-wrap gap-2">
        {['tipLight', 'tipOne', 'tipFill', 'tipFocus'].map((k) => <li key={k} className="rounded-full border border-ink/15 bg-white/70 px-3.5 py-1.5 text-[13px]">{t(`ws.check.${k}`)}</li>)}
      </ul>
    </div>
  );
};

export default UploadBox;
