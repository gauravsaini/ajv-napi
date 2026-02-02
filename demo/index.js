const Ajv = require('ajv-napi');

async function main() {
  console.log('🚀 ajv-napi Demo\n');

  // 1. Initialize AJV
  const ajv = new Ajv();
  console.log('✅ AJV Initialized');

  // 2. Define a Schema
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'integer', minimum: 18 },
      email: { type: 'string', format: 'email' }
    },
    required: ['name', 'email'],
    additionalProperties: false
  };

  // 3. Compile Schema
  // Method A: Direct compilation to a validate function
  const validate = ajv.compile(schema);
  console.log('✅ Schema Compiled (Method A: compile)');

  // 4. Validate Data
  const validData = {
    name: "Alice",
    age: 25,
    email: "alice@example.com"
  };

  const invalidData = {
    name: "Bob",
    age: 15, // Too young
    email: "bob-not-email" // Invalid format
  };

  console.log('\n--- Validation Results (Method A) ---');
  
  // Valid Case
  const isValid = validate(validData);
  console.log(`Valid Data: ${isValid ? 'PASSED ✅' : 'FAILED ❌'}`);
  if (!isValid) console.log('Errors:', validate.errors);

  // Invalid Case
  const isInvalidValid = validate(invalidData);
  console.log(`Invalid Data: ${isInvalidValid ? 'PASSED ❌' : 'FAILED ✅ (As expected)'}`);
  
  if (!isInvalidValid) {
    console.log('Errors:', validate.errors);
  }

  // 5. Schema Caching (Method B: addSchema + validate by ID)
  // Note: Current wrapper implementation validates by schema object mainly, 
  // but let's test the standard AJV pattern if supported or fallback to standard compilation.
  console.log('\n--- Method B: Schema Caching ---');
  
  // Add schema with key
  // ajv.addSchema(schema, 'user-schema'); 
  // Note: wrapper.js delegates addSchema to Rust.
  
  // Currently validate(schema, data) compiles locally in wrapper.
  // So standard re-use is via the 'validate' function returned by compile().
  
  console.log('Reusable validate function is the recommended way for performance.');
}

main().catch(console.error);
