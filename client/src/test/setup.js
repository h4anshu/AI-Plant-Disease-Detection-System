import '@testing-library/jest-dom/vitest';
import '../i18n'; // jsdom's navigator.language is en-US, so tests run in English
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom has no object URLs; UploadBox uses one for the preview
URL.createObjectURL = () => 'blob:preview';
