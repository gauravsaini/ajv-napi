import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ajv = require('./wrapper.js');

export default Ajv;
export const { validate } = Ajv;
