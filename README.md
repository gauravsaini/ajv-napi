# ajv-napi

[![npm version](https://badge.fury.io/js/%40gauravsaini%2Fajv-napi.svg)](https://www.npmjs.com/package/@gauravsaini/ajv-napi)
[![CI](https://github.com/gauravsaini/ajv-napi/actions/workflows/CI.yml/badge.svg)](https://github.com/gauravsaini/ajv-napi/actions/workflows/CI.yml)

A high-performance **drop-in replacement** for [Ajv](https://github.com/ajv-validator/ajv) — the most popular JSON Schema validator for JavaScript.

Built with Rust, NAPI-RS, and SIMD-accelerated JSON parsing for maximum throughput.

## 🔄 Ajv Compatibility

**ajv-napi is fully API-compatible with [ajv-validator/ajv](https://github.com/ajv-validator/ajv)**. You can swap it into your existing codebase with zero code changes:

```javascript
// Before
const Ajv = require("ajv")

// After — just change the import!
const Ajv = require("@gauravsaini/ajv-napi")

// Your existing code works unchanged
const ajv = new Ajv()
const validate = ajv.compile(schema)
validate(data)              // ✅ Same API
validate.errors             // ✅ Same error format
```

### Supported Ajv Features

| Feature | Status | Notes |
|---------|--------|-------|
| `new Ajv()` constructor | ✅ | Full options support |
| `ajv.compile(schema)` | ✅ | Returns validate function |
| `validate(data)` | ✅ | Boolean + errors array |
| `validate.errors` | ✅ | Ajv-compatible error objects |
| JSON Schema Draft-07 | ✅ | Full spec compliance |
| JSON Schema Draft-04/06 | ✅ | Supported |
| `format` keyword | ✅ | email, uri, date-time, etc. |
| `$ref` references | ✅ | Local and remote refs |
| `additionalProperties` | ✅ | Full support |
| `allOf/anyOf/oneOf` | ✅ | Full support |
| `if/then/else` | ✅ | Conditional schemas |
| Custom keywords | ⚠️ | Not yet (use Ajv for this) |
| Custom formats (JS) | ⚠️ | Not yet (use Ajv for this) |

### Error Format Compatibility

ajv-napi returns errors in the same format as Ajv:

```javascript
validate({email: "invalid"})
console.log(validate.errors)
// [
//   {
//     instancePath: "/email",
//     schemaPath: "#/properties/email/format",
//     keyword: "format",
//     params: { format: "email" },
//     message: "must match format \"email\""
//   }
// ]
```

## 🚀 Performance vs Ajv

Benchmarks on Node.js v22 (Apple M1 Max) with Buffer inputs:

| Scenario | ajv-napi | ajv (JS) | Improvement |
|----------|----------|----------|-------------|
| **Simple Schema** | ~1.59M ops/sec | ~1.71M ops/sec | -7% (V8 wins simple cases) |
| **Complex Schema** | ~1,738 ops/sec | ~1,123 ops/sec | **+55%** |
| **Large Payload (260KB)** | ~1,475 ops/sec | ~1,074 ops/sec | **+37%** |

### When ajv-napi Shines

- ✅ Complex schemas with regex, format validation, conditionals
- ✅ High-throughput validation pipelines (API servers, message queues)
- ✅ Buffer/stream inputs (files, network I/O)
- ✅ Large JSON payloads where GC pressure matters

### When to Stick with Ajv

- Simple type-checking without regex/format validation
- Need custom keywords or formats defined in JavaScript
- Data already parsed as JS objects (no I/O overhead)

## 📦 Installation

```bash
npm install @gauravsaini/ajv-napi
# or
yarn add @gauravsaini/ajv-napi
```

Pre-built binaries available for:
- macOS (x64, ARM64)
- Linux (x64, ARM64, musl)
- Windows (x64, ARM64)

## 📖 Usage

### Standard Ajv API (drop-in replacement)

```javascript
const Ajv = require("@gauravsaini/ajv-napi")
const ajv = new Ajv()

const schema = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    age: { type: "integer", minimum: 0 }
  },
  required: ["email"]
}

const validate = ajv.compile(schema)

// Standard validation
const valid = validate({ email: "test@example.com", age: 25 })
if (!valid) console.log(validate.errors)
```

### High-Performance Buffer API (ajv-napi exclusive)

```javascript
// For I/O workloads — validate buffers directly without JS parsing
const buf = Buffer.from('{"email":"test@example.com","age":25}')

validate.validateBuffer(buf)    // Returns boolean, populates errors
validate.isValidBuffer(buf)     // Fast path — boolean only, no error details
```

## 🔧 API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `new Ajv(options?)` | `Ajv` | Create validator instance |
| `ajv.compile(schema, opts?)` | `ValidateFunction` | Compile schema. `opts.validateFormats` supported. |
| `ajv.removeSchema()` | `Ajv` | Clears all cached schemas (fixing memory leaks) |
| `validate(data)` | `boolean` | Validate JS object/value |
| `validate.errors` | `Error[] \| null` | Validation errors (Ajv format) |
| `validate.validateString(str)` | `boolean` | Validate JSON string |
| `validate.validateBuffer(buf)` | `boolean` | Validate Buffer (recommended) |
| `validate.isValidBuffer(buf)` | `boolean` | Fast validation, no errors |

## 🏗️ Why Rust + NAPI?

- **simd-json**: SIMD-accelerated JSON parsing competitive with V8
- **Compiled regex**: Rust regex engine is compiled, not interpreted
- **mimalloc**: Microsoft's allocator reduces heap fragmentation
- **Thread-local buffers**: Avoids repeated allocations
- **Zero-copy validation**: Buffer inputs avoid JS string conversion

## 🔨 Building from Source

Requires Rust toolchain and Node.js:

```bash
# Install dependencies
yarn install

# Build for current platform
yarn build

# Run tests
yarn test
```

## 📋 Limitations

- Custom keywords and formats (defined in JS) are not yet supported
- Slightly slower than Ajv for very simple schemas due to FFI overhead
- Requires native binaries (pre-built for major platforms)

## 🤝 Migration from Ajv

1. Install: `npm install @gauravsaini/ajv-napi`
2. Replace import: `require("ajv")` → `require("@gauravsaini/ajv-napi")`
3. Done! Your existing code works unchanged.

For maximum performance, consider using `validateBuffer()` for I/O workloads.

## 📄 License

MIT

## 🙏 Credits

- [ajv-validator/ajv](https://github.com/ajv-validator/ajv) — The gold standard for JSON Schema validation in JavaScript
- [jsonschema](https://crates.io/crates/jsonschema) — Rust JSON Schema implementation
- [napi-rs](https://napi.rs/) — Rust bindings for Node.js
- [simd-json](https://github.com/simd-lite/simd-json) — SIMD-accelerated JSON parsing
