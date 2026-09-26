// Dummy settings for tests: Cloudinary and the ML service are mocked with nock, MongoDB is in-memory.
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = '000000000000000';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
process.env.FASTAPI_URL = 'http://ml.test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ML_SERVICE_TOKEN = 'test-ml-token';
process.env.PREDICT_RATE_LIMIT = '1000'; // tests/hardening.test.js loads the app with a low limit
process.env.FIELD_RATE_LIMIT = '1000';
process.env.RISK_RATE_LIMIT = '1000';
process.env.OSM_TILE_URL = 'http://tiles.test/{z}/{x}/{y}.png';
process.env.REPORT_RATE_LIMIT = '1000';
process.env.OPEN_METEO_URL = 'http://meteo.test/v1/forecast';
