# ajv-napi

[![npm version](https://badge.fury.io/js/ajv-napi.svg)](https://www.npmjs.com/package/ajv-napi)
[![CI](https://github.com/gauravsaini/ajv-napi/actions/workflows/CI.yml/badge.svg)](https://github.com/gauravsaini/ajv-napi/actions/workflows/CI.yml)

The **most spec-compliant** JSON Schema validator for Node.js — and a high-performance **drop-in replacement** for [Ajv](https://github.com/ajv-validator/ajv).

Built with Rust, NAPI-RS, and SIMD-accelerated JSON parsing. **#1 in correctness** across Draft 6 & Draft 7 in the [json-schema-benchmark](https://github.com/ebdrup/json-schema-benchmark) suite.

## 🚀 Quick Start & Demo

We provide a complete runnable demo in the `demo/` folder.

```bash
# 1. Clone the repository
git clone https://github.com/gauravsaini/ajv-napi.git
cd ajv-napi/demo

# 2. Install dependencies
npm install

# 3. Run the demo
node index.js
```

This demo showcases:

- Basic schema compilation & validation
- Error handling
- Cache control
- Validating valid/invalid data

## 🔄 Ajv Compatibility

**ajv-napi is fully API-compatible with [ajv-validator/ajv](https://github.com/ajv-validator/ajv)**. You can swap it into your existing codebase with zero code changes:

```javascript
// Before
const Ajv = require("ajv")

// After — just change the import!
const Ajv = require("ajv-napi")

// Your existing code works unchanged
const ajv = new Ajv()
const validate = ajv.compile(schema)
validate(data) // ✅ Same API
validate.errors // ✅ Same error format
```

### Supported Ajv Features

| Feature                 | Status | Notes                                                |
| ----------------------- | ------ | ---------------------------------------------------- |
| `new Ajv()` constructor | ✅     | Full options support                                 |
| `ajv.compile(schema)`   | ✅     | Returns validate function                            |
| `validate(data)`        | ✅     | Boolean + errors array                               |
| `validate.errors`       | ✅     | Ajv-compatible error objects                         |
| JSON Schema Draft-07    | ✅     | **#1 most compliant** (2 failing tests vs ajv's 103) |
| JSON Schema Draft-06    | ✅     | **#1 most compliant** (2 failing tests vs ajv's 10)  |
| JSON Schema Draft-04    | ✅     | **#2 most compliant** (6 failing tests vs ajv's 26)  |
| `format` keyword        | ✅     | email, uri, date-time, etc.                          |
| `$ref` references       | ✅     | Local and remote refs                                |
| `additionalProperties`  | ✅     | Full support                                         |
| `allOf/anyOf/oneOf`     | ✅     | Full support                                         |
| `if/then/else`          | ✅     | Conditional schemas                                  |
| Custom keywords         | ⚠️     | Not yet (use Ajv for this)                           |
| Custom formats (JS)     | ⚠️     | Not yet (use Ajv for this)                           |

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

## 🏆 Spec Compliance — json-schema-benchmark

Tested against **23 validators** using the [json-schema-benchmark](https://github.com/ebdrup/json-schema-benchmark) suite (JSON Schema Test Suite).

### Draft 7 — 🥇 #1 Most Compliant

| Validator             | Failing Tests |
| --------------------- | :-----------: |
| **ajv-napi**          |     **2**     |
| @cfworker/json-schema |      49       |
| jsonschema            |      77       |
| @exodus/schemasafe    |      101      |
| ajv                   |      103      |

### Draft 6 — 🥇 #1 Most Compliant

| Validator             | Failing Tests |
| --------------------- | :-----------: |
| **ajv-napi**          |     **2**     |
| @exodus/schemasafe    |       8       |
| @cfworker/json-schema |       9       |
| ajv                   |      10       |

### Draft 4 — 🥈 #2 Most Compliant

| Validator             | Failing Tests |
| --------------------- | :-----------: |
| @exodus/schemasafe    |       3       |
| **ajv-napi**          |     **6**     |
| @cfworker/json-schema |       9       |
| ajv                   |      26       |

> The only 2 remaining failures in Draft 6/7 are `contentMediaType`/`contentEncoding` validation — an optional spec feature that most validators skip.

## 🚀 Performance

### Micro-benchmarks (Node.js v22, Apple M1 Max, Buffer inputs)

| Scenario                  | ajv-napi       | ajv (JS)       | Improvement                |
| ------------------------- | -------------- | -------------- | -------------------------- |
| **Simple Schema**         | ~1.59M ops/sec | ~1.71M ops/sec | -7% (V8 wins simple cases) |
| **Complex Schema**        | ~1,738 ops/sec | ~1,123 ops/sec | **+55%**                   |
| **Large Payload (260KB)** | ~1,475 ops/sec | ~1,074 ops/sec | **+37%**                   |

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
npm install ajv-napi
# or
yarn add ajv-napi
```

Pre-built binaries available for:

- macOS (x64, ARM64)
- Windows (x64, ARM64)

> **Note:** Linux binaries are temporarily unavailable due to CI infrastructure issues. Linux support will be restored shortly. In the meantime, Linux users can build from source.

## 📖 Usage

### Standard Ajv API (drop-in replacement)

```javascript
const Ajv = require("ajv-napi")
const ajv = new Ajv()

const schema = {
  type: "object",
  properties: {
    email: {type: "string", format: "email"},
    age: {type: "integer", minimum: 0},
  },
  required: ["email"],
}

const validate = ajv.compile(schema)

// Standard validation
const valid = validate({email: "test@example.com", age: 25})
if (!valid) console.log(validate.errors)
```

### High-Performance Buffer API (ajv-napi exclusive)

```javascript
// For I/O workloads — validate buffers directly without JS parsing
const buf = Buffer.from('{"email":"test@example.com","age":25}')

validate.validateBuffer(buf) // Returns boolean, populates errors
validate.isValidBuffer(buf) // Fast path — boolean only, no error details
```

## 🔧 API Reference

| Method                         | Returns            | Description                                       |
| ------------------------------ | ------------------ | ------------------------------------------------- |
| `new Ajv(options?)`            | `Ajv`              | Create validator instance                         |
| `ajv.compile(schema, opts?)`   | `ValidateFunction` | Compile schema. `opts.validateFormats` supported. |
| `ajv.removeSchema()`           | `Ajv`              | Clears all cached schemas (fixing memory leaks)   |
| `validate(data)`               | `boolean`          | Validate JS object/value                          |
| `validate.errors`              | `Error[] \| null`  | Validation errors (Ajv format)                    |
| `validate.validateString(str)` | `boolean`          | Validate JSON string                              |
| `validate.validateBuffer(buf)` | `boolean`          | Validate Buffer (recommended)                     |
| `validate.isValidBuffer(buf)`  | `boolean`          | Fast validation, no errors                        |

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

1. Install: `npm install ajv-napi`
2. Replace import: `require("ajv")` → `require("ajv-napi")`
3. Done! Your existing code works unchanged.

For maximum performance, consider using `validateBuffer()` for I/O workloads.

## 📄 License

MIT

## 🙏 Credits

- [ajv-validator/ajv](https://github.com/ajv-validator/ajv) — The gold standard for JSON Schema validation in JavaScript
- [jsonschema](https://crates.io/crates/jsonschema) — Rust JSON Schema implementation
- [napi-rs](https://napi.rs/) — Rust bindings for Node.js
- [simd-json](https://github.com/simd-lite/simd-json) — SIMD-accelerated JSON parsing
