import Ajv from './wrapper.mjs';
import { validate } from './wrapper.mjs';
import assert from 'assert';

console.log('Testing ESM support...');

const ajv = new Ajv();
const schema = {
  type: "object",
  properties: {
    foo: { type: "integer" }
  }
};

const validator = ajv.compile(schema);
const valid = validator({ foo: 1 });
assert.strictEqual(valid, true, 'Basic validation should pass');

console.log('✅ ESM import works');
console.log('✅ Ajv class instantiation works');
console.log('✅ Compilation works');
console.log('✅ Validation works');
