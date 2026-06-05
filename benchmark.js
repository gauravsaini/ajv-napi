/**
 * ajv-napi Buffer-Based Benchmark
 *
 * This benchmark simulates the realistic I/O server use case that ajv-napi
 * targets: raw JSON arrives as a Buffer from the network (HTTP request body,
 * message queue payload, file read, etc.) and must be validated before
 * processing.
 *
 * The fair comparison is:
 *   Ajv (JS):   JSON.parse(buffer.toString()) → validate(parsed)
 *   ajv-napi:   validate.validateBuffer(buffer)   (single call)
 *   ajv-napi:   validate.isValidBuffer(buffer)    (fast path, no errors)
 *
 * We pre-allocate all buffers before benchmarking to isolate validation
 * throughput from allocation noise.
 */

const AjvJS = require('ajv');
const addFormats = require('ajv-formats');
const AjvNapi = require('./wrapper.js');

// ─── Benchmark Harness ────────────────────────────────────────────────

function runBenchmark(name, fn, durationMs = 3000) {
  // Warmup: run enough iterations to trigger V8 JIT optimization
  for (let i = 0; i < 5000; i++) fn();

  // Timed run
  const start = process.hrtime.bigint();
  let count = 0;
  const endTime = Date.now() + durationMs;
  while (Date.now() < endTime) {
    fn();
    count++;
  }
  const elapsed = Number(process.hrtime.bigint() - start) / 1e9;
  return count / elapsed;
}

function formatOps(ops) {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`;
  return ops.toFixed(0);
}

function pctDiff(a, b) {
  const pct = ((a - b) / b * 100).toFixed(1);
  return a > b ? `+${pct}%` : `${pct}%`;
}

// ─── Schemas ──────────────────────────────────────────────────────────

// Schema 1: Simple (minimal, type-check only)
const simpleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
    active: { type: 'boolean' }
  },
  required: ['name', 'age']
};

// Schema 2: Complex with formats, regex, conditionals, nested refs
const complexSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' },
    email: { type: 'string', format: 'email' },
    created_at: { type: 'string', format: 'date-time' },
    profile: {
      type: 'object',
      properties: {
        display_name: { type: 'string', minLength: 1, maxLength: 64 },
        bio: { type: 'string', maxLength: 500 },
        website: { type: 'string', format: 'uri' },
        age: { type: 'integer', minimum: 13, maximum: 150 }
      },
      required: ['display_name']
    },
    roles: {
      type: 'array',
      items: { type: 'string', enum: ['admin', 'editor', 'viewer', 'billing'] },
      minItems: 1,
      uniqueItems: true
    },
    preferences: {
      type: 'object',
      properties: {
        theme: { type: 'string', enum: ['light', 'dark', 'system'] },
        notifications: {
          type: 'object',
          properties: {
            email: { type: 'boolean' },
            push: { type: 'boolean' },
            sms: { type: 'boolean' }
          }
        },
        locale: { type: 'string', pattern: '^[a-z]{2}-[A-Z]{2}$' }
      }
    },
    status: { type: 'string', enum: ['active', 'suspended', 'pending_review'] }
  },
  required: ['id', 'email', 'created_at', 'profile', 'roles', 'status'],
  additionalProperties: false,
  if: {
    properties: { status: { const: 'suspended' } }
  },
  then: {
    properties: {
      suspension_reason: { type: 'string', minLength: 10 }
    },
    required: ['suspension_reason']
  }
};

// Schema 3: API batch payload — array of complex items
const batchSchema = {
  type: 'array',
  items: complexSchema,
  minItems: 1,
  maxItems: 10000
};

// ─── Generate Realistic Test Data ─────────────────────────────────────

function generateComplexItem(i) {
  return {
    id: `a1b2c3d4-e5f6-7890-abcd-${String(i).padStart(12, '0')}`,
    email: `user-${i}@example.com`,
    created_at: '2026-06-06T12:00:00Z',
    profile: {
      display_name: `User ${i}`,
      bio: `This is the bio for user ${i}. It contains a moderate amount of text to simulate realistic payloads that a production system might handle.`,
      website: `https://example.com/users/${i}`,
      age: 20 + (i % 80)
    },
    roles: ['viewer', 'editor'].slice(0, 1 + (i % 2)),
    preferences: {
      theme: ['light', 'dark', 'system'][i % 3],
      notifications: { email: true, push: i % 2 === 0, sms: false },
      locale: 'en-US'
    },
    status: 'active'
  };
}

// Pre-generate buffers
const simpleData = { name: 'Alice', age: 30, active: true };
const simpleBuffer = Buffer.from(JSON.stringify(simpleData));

const complexData = generateComplexItem(1);
const complexBuffer = Buffer.from(JSON.stringify(complexData));

// ~10KB payload (batch of 20)
const batch20 = Array.from({ length: 20 }, (_, i) => generateComplexItem(i));
const batch20Buffer = Buffer.from(JSON.stringify(batch20));

// ~50KB payload (batch of 100)
const batch100 = Array.from({ length: 100 }, (_, i) => generateComplexItem(i));
const batch100Buffer = Buffer.from(JSON.stringify(batch100));

// ~260KB payload (batch of 500)
const batch500 = Array.from({ length: 500 }, (_, i) => generateComplexItem(i));
const batch500Buffer = Buffer.from(JSON.stringify(batch500));

console.log('📊 Buffer-Based I/O Benchmark for ajv-napi\n');
console.log('Simulating: Raw JSON buffers arriving from network → validation\n');
console.log('Pre-allocated buffer sizes:');
console.log(`   Simple object:     ${simpleBuffer.length} bytes`);
console.log(`   Complex object:    ${complexBuffer.length} bytes`);
console.log(`   Batch (20 items):  ${(batch20Buffer.length / 1024).toFixed(1)} KB`);
console.log(`   Batch (100 items): ${(batch100Buffer.length / 1024).toFixed(1)} KB`);
console.log(`   Batch (500 items): ${(batch500Buffer.length / 1024).toFixed(1)} KB`);
console.log('');

// ─── Compile Validators ───────────────────────────────────────────────

const ajvJS = new AjvJS({ allErrors: true });
addFormats(ajvJS);
const ajvNapi = new AjvNapi();

const jsSimple = ajvJS.compile(simpleSchema);
const napiSimple = ajvNapi.compile(simpleSchema);

const jsComplex = ajvJS.compile(complexSchema);
const napiComplex = ajvNapi.compile(complexSchema);

const jsBatch = ajvJS.compile(batchSchema);
const napiBatch = ajvNapi.compile(batchSchema);

// ─── Correctness Check ───────────────────────────────────────────────

function assertBufEquiv(label, jsFn, napiFn, buffer) {
  const parsed = JSON.parse(buffer.toString());
  const jsResult = jsFn(parsed);
  const napiResult = napiFn(buffer);
  if (jsResult !== napiResult) {
    throw new Error(`[MISMATCH] ${label}: JS=${jsResult}, NAPI=${napiResult}`);
  }
}

assertBufEquiv('Simple', jsSimple, napiSimple.validateBuffer, simpleBuffer);
assertBufEquiv('Complex', jsComplex, napiComplex.validateBuffer, complexBuffer);
assertBufEquiv('Batch20', jsBatch, napiBatch.validateBuffer, batch20Buffer);
assertBufEquiv('Batch100', jsBatch, napiBatch.validateBuffer, batch100Buffer);
assertBufEquiv('Batch500', jsBatch, napiBatch.validateBuffer, batch500Buffer);
console.log('✅ Correctness verified: All validators return identical results.\n');

// ─── Run Benchmark Suites ─────────────────────────────────────────────

const suites = [
  {
    name: '1. Simple Schema (Buffer → Validate)',
    note: `Buffer size: ${simpleBuffer.length} bytes`,
    cases: [
      {
        name: 'Ajv (JS): parse + validate',
        fn: () => jsSimple(JSON.parse(simpleBuffer.toString()))
      },
      {
        name: 'ajv-napi: validateBuffer',
        fn: () => napiSimple.validateBuffer(simpleBuffer)
      },
      {
        name: 'ajv-napi: isValidBuffer',
        fn: () => napiSimple.isValidBuffer(simpleBuffer)
      }
    ]
  },
  {
    name: '2. Complex Schema w/ Formats+Regex+Conditionals (Buffer → Validate)',
    note: `Buffer size: ${complexBuffer.length} bytes`,
    cases: [
      {
        name: 'Ajv (JS): parse + validate',
        fn: () => jsComplex(JSON.parse(complexBuffer.toString()))
      },
      {
        name: 'ajv-napi: validateBuffer',
        fn: () => napiComplex.validateBuffer(complexBuffer)
      },
      {
        name: 'ajv-napi: isValidBuffer',
        fn: () => napiComplex.isValidBuffer(complexBuffer)
      }
    ]
  },
  {
    name: '3. Batch API Payload — 20 items (~10KB)',
    note: `Buffer size: ${(batch20Buffer.length / 1024).toFixed(1)} KB`,
    cases: [
      {
        name: 'Ajv (JS): parse + validate',
        fn: () => jsBatch(JSON.parse(batch20Buffer.toString()))
      },
      {
        name: 'ajv-napi: validateBuffer',
        fn: () => napiBatch.validateBuffer(batch20Buffer)
      },
      {
        name: 'ajv-napi: isValidBuffer',
        fn: () => napiBatch.isValidBuffer(batch20Buffer)
      }
    ]
  },
  {
    name: '4. Batch API Payload — 100 items (~50KB)',
    note: `Buffer size: ${(batch100Buffer.length / 1024).toFixed(1)} KB`,
    cases: [
      {
        name: 'Ajv (JS): parse + validate',
        fn: () => jsBatch(JSON.parse(batch100Buffer.toString()))
      },
      {
        name: 'ajv-napi: validateBuffer',
        fn: () => napiBatch.validateBuffer(batch100Buffer)
      },
      {
        name: 'ajv-napi: isValidBuffer',
        fn: () => napiBatch.isValidBuffer(batch100Buffer)
      }
    ]
  },
  {
    name: '5. Large Batch API Payload — 500 items (~260KB)',
    note: `Buffer size: ${(batch500Buffer.length / 1024).toFixed(1)} KB`,
    cases: [
      {
        name: 'Ajv (JS): parse + validate',
        fn: () => jsBatch(JSON.parse(batch500Buffer.toString()))
      },
      {
        name: 'ajv-napi: validateBuffer',
        fn: () => napiBatch.validateBuffer(batch500Buffer)
      },
      {
        name: 'ajv-napi: isValidBuffer',
        fn: () => napiBatch.isValidBuffer(batch500Buffer)
      }
    ]
  }
];

// Run all suites
const allResults = [];

for (const suite of suites) {
  console.log(`${'═'.repeat(70)}`);
  console.log(`  ${suite.name}`);
  console.log(`  ${suite.note}`);
  console.log(`${'═'.repeat(70)}`);

  const results = [];
  for (const tc of suite.cases) {
    process.stdout.write(`   ⏱  ${tc.name}...`);
    const ops = runBenchmark(tc.name, tc.fn, 3000);
    results.push({ name: tc.name, ops });
    console.log(` ${formatOps(ops)} ops/sec`);
  }

  // Compare ajv-napi validateBuffer vs Ajv JS
  const jsOps = results[0].ops;
  const napiValidateOps = results[1].ops;
  const napiIsValidOps = results[2].ops;

  console.log('');
  console.log(`   📊 validateBuffer vs Ajv(JS):  ${pctDiff(napiValidateOps, jsOps)}`);
  console.log(`   📊 isValidBuffer  vs Ajv(JS):  ${pctDiff(napiIsValidOps, jsOps)}`);
  console.log('');

  allResults.push({ suite: suite.name, jsOps, napiValidateOps, napiIsValidOps });
}

// ─── Summary Table ────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70));
console.log('  SUMMARY: Buffer-to-Validation Pipeline');
console.log('═'.repeat(70));
console.log('');
console.log('  Scenario                        │ Ajv (JS)     │ ajv-napi     │ ajv-napi      │ Δ validate │ Δ isValid');
console.log('                                  │ parse+valid  │ validateBuf  │ isValidBuf    │ vs JS      │ vs JS');
console.log('  ────────────────────────────────┼──────────────┼──────────────┼───────────────┼────────────┼──────────');

for (const r of allResults) {
  const label = r.suite.replace(/^\d+\.\s*/, '').substring(0, 34).padEnd(34);
  const js = formatOps(r.jsOps).padStart(12);
  const nv = formatOps(r.napiValidateOps).padStart(12);
  const ni = formatOps(r.napiIsValidOps).padStart(13);
  const dv = pctDiff(r.napiValidateOps, r.jsOps).padStart(10);
  const di = pctDiff(r.napiIsValidOps, r.jsOps).padStart(9);
  console.log(`  ${label}│${js} │${nv} │${ni} │${dv} │${di}`);
}
console.log('');
