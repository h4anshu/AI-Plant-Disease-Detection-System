import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResultCard from '../components/ResultCard';

const base = { imageUrl: 'https://img.test/leaf.jpg', crop: 'blackgram', reasons: [] };

describe('ResultCard', () => {
  test('ok: shows the diagnosis, confidence, treatment and yield impact', () => {
    render(<ResultCard result={{ ...base, status: 'ok', disease: 'Yellow_Mosaic', confidence: 0.981,
      severity: 'moderate', treatment: 'Control whiteflies.', yieldLossPercent: 50 }} />);
    expect(screen.getByRole('heading', { name: 'Yellow Mosaic' })).toBeInTheDocument();
    expect(screen.getByText('98.1%')).toBeInTheDocument();
    expect(screen.getByText('Control whiteflies.')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('MODERATE')).toBeInTheDocument();
  });

  test('records saved before the gate (no status) render as a diagnosis', () => {
    render(<ResultCard result={{ ...base, disease: 'Healthy', confidence: 0.9, severity: 'healthy',
      treatment: 'Looks fine.', yieldLossPercent: 0 }} />);
    expect(screen.getByRole('heading', { name: 'Healthy' })).toBeInTheDocument();
  });

  test('uncertain: no disease as a diagnosis, no treatment; leanings only in the collapsed section', () => {
    render(<ResultCard result={{ ...base, status: 'uncertain', reasons: ['unfamiliar_image'], disease: 'Yellow_Mosaic',
      confidence: 0.6, severity: 'early', treatment: null, yieldLossPercent: null,
      top3: [{ disease: 'Yellow_Mosaic', probability: 0.6 }, { disease: 'Healthy', probability: 0.3 },
        { disease: 'Anthracnose', probability: 0.1 }] }} />);
    expect(screen.getByRole('heading', { name: "We're not sure about this one" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Yellow Mosaic' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Treatment/i)).not.toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
    expect(screen.getByText(/right crop is selected/i)).toBeInTheDocument();
  });

  test('rejected_quality: retake message with the matching tip', () => {
    render(<ResultCard result={{ ...base, status: 'rejected_quality', reasons: ['blurry', 'too_dark'] }} />);
    expect(screen.getByRole('heading', { name: 'Photo not clear enough' })).toBeInTheDocument();
    expect(screen.getByText(/tap the leaf on screen to focus/i)).toBeInTheDocument();
    expect(screen.getByText(/Take the photo in daylight/i)).toBeInTheDocument();
    expect(screen.getByText('RETAKE')).toBeInTheDocument();
  });

  test('not_leaf: asks for a photo of the leaf', () => {
    render(<ResultCard result={{ ...base, status: 'not_leaf', reasons: ['no_leaf'] }} />);
    expect(screen.getByRole('heading', { name: 'No leaf found' })).toBeInTheDocument();
    expect(screen.getByText(/Fill most of the frame with one leaf/i)).toBeInTheDocument();
  });
});
