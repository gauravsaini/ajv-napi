# ajv-napi

A high-performance Node.js native addon for JSON Schema validation, powered by Rust, the `jsonschema` crate, `mimalloc`, and `simd-json`.

## Features

- **Fastest for Complex Validation**: Beats `ajv` (JS) by 37-55% on complex schemas with regex/format validation.
- **Optimized for I/O Workloads**: Designed for buffer inputs from files, network, and message queues.
- **Strict Compliance**: Uses the spec-compliant `jsonschema` Rust crate.
- **Native Performance**: Leverages `simd-json` for fast parsing and `mimalloc` for efficient memory allocation.
- **Fast Path API**: `isValidBuffer()` method skips error collection for maximum throughput.

## Performance vs Ajv (JS)

Benchmarks run on Node.js v22 (M1 Max) with Buffer inputs (simulating I/O workloads).

| Scenario                  | ajv-napi       | ajv (JS)       | Improvement                              |
| ------------------------- | -------------- | -------------- | ---------------------------------------- |
| **Simple Schema**         | ~1.59M ops/sec | ~1.71M ops/sec | -7% (V8 JSON.parse wins for simple data) |
| **Complex Schema**        | ~1,738 ops/sec | ~1,123 ops/sec | **+55%**                                 |
| **Large Payload (260KB)** | ~1,475 ops/sec | ~1,074 ops/sec | **+37%**                                 |

### Why ajv-napi Wins on Complex Schemas

- **simd-json**: SIMD-accelerated JSON parsing competitive with V8
- **Compiled Regex**: Rust regex engine is compiled, not interpreted like V8
- **mimalloc**: Microsoft's allocator reduces heap fragmentation under load
- **Thread-local Buffers**: Avoids repeated allocations during parsing

### When to Use ajv-napi

- Backend services with complex validation rules (regex, formats, conditionals)
- High-throughput validation pipelines processing buffer inputs
- Workloads where GC pressure from large JSON objects is a concern

### When to Use Ajv (JS)

- Simple type-checking schemas without regex/format validation
- Data is already parsed into JS objects (no I/O)
- You need custom keywords or formats defined in JavaScript

## Usage

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
validate({email: "test@example.com", age: 25})

// Buffer validation (fastest for I/O workloads)
const buf = Buffer.from('{"email":"test@example.com","age":25}')
validate.validateBuffer(buf)

// Fast path - returns boolean only, no error details
validate.isValidBuffer(buf) // true or false
```

## API

| Method                   | Returns   | Use Case                                            |
| ------------------------ | --------- | --------------------------------------------------- |
| `validate(data)`         | `boolean` | Standard validation, populates `validate.errors`    |
| `validateString(str)`    | `boolean` | Validate JSON string                                |
| `validateBuffer(buffer)` | `boolean` | Validate raw Buffer (recommended for I/O)           |
| `isValidBuffer(buffer)`  | `boolean` | Fast path, no error collection (highest throughput) |

## Build

Requires Rust and Node.js:

```bash
cargo build --release
cp target/release/libajv_napi.dylib ajv-napi.darwin-arm64.node
```

For cross-platform builds, use `napi-rs` CLI tools.

## Limitations

- Requires native build toolchain or pre-compiled binaries for each platform.
- Custom keywords and formats defined in JavaScript are not supported.
- Slightly slower than JS for simple schemas due to FFI overhead.
