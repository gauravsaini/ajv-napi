const Ajv = require('./wrapper.js');
const assert = require('assert');

console.log('Testing new features...');

// Test 1: Per-Schema Compilation Options (validateFormats)
console.log('Test 1: Per-Schema Compilation Options (validateFormats)');
const ajv = new Ajv();

const formatSchema = {
  type: "string",
  format: "email"
};

// 1a. Default behavior (strict formats)
const validateStrict = ajv.compile(formatSchema); // defaults to true
const resultStrict = validateStrict("not-an-email");
assert.strictEqual(resultStrict, false, 'Default should be strict format validation');
console.log('  ✅ Default strict validation passed');

// 1b. Disable format validation
const validateLoose = ajv.compile(formatSchema, { validateFormats: false });
const resultLoose = validateLoose("not-an-email");
assert.strictEqual(resultLoose, true, 'Should pass when validateFormats: false');
console.log('  ✅ validateFormats: false passed');

// Test 2: Cache Control (removeSchema/clearCache)
console.log('\nTest 2: Cache Control');
const ajv2 = new Ajv();

// We can't easily check internal memory usage, but we can verify it doesn't crash
// and effectively allows "re-compiling" cleanly (simulated).
try {
  ajv2.removeSchema(); // Clears cache
  console.log('  ✅ removeSchema() called successfully');
  
  // Verify we can still compile after clearing
  const v = ajv2.compile({ type: "integer" });
  assert.strictEqual(v(1), true);
  console.log('  ✅ Compiler works after cache clear');
} catch (e) {
  console.error('  ❌ Cache control failed:', e);
  process.exit(1);
}

console.log('\nAll feature tests passed! 🚀');
