import { useTranslation } from 'react-i18next';
import FieldHealth from '../FieldHealth';

// "How does my crop look from space?" for a saved field (docs/CROP_HEALTH.md): the vegetation index of its last 120 days against the fields
// around it. On request only: each uncached answer is an Earth Engine computation. `key` starts it afresh when another field is chosen.
const CropHealthCard = ({ field, name }) => {
  const { t } = useTranslation();
  return (
    <article className="ws-card p-6" aria-labelledby="crop-health-title">
      <h2 id="crop-health-title" className="font-display text-2xl">{t('alerts.health.title', { name })}</h2>
      <FieldHealth key={field._id} fieldId={field._id} crop={field.crop} />
    </article>
  );
};

export default CropHealthCard;
