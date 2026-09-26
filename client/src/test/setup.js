import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom has no object URLs; UploadBox uses one for the preview
URL.createObjectURL = () => 'blob:preview';
