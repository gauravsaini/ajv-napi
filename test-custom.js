const Ajv = require("./wrapper")
const assert = require("assert")

console.log("Starting custom keywords/formats tests...")

const ajv = new Ajv()

// Test addFormat
try {
  ajv.addFormat("foo", (data) => data === "bar")
  const schemaFormat = {type: "string", format: "foo"}
  const validateFormat = ajv.compile(schemaFormat)

  assert.strictEqual(validateFormat("bar"), true, "Format valid should pass")
  assert.strictEqual(validateFormat("baz"), false, "Format invalid should fail")
  console.log("✅ Custom format tests passed")
} catch (e) {
  console.error("❌ Custom format tests failed:", e)
  process.exit(1)
}

// Test addKeyword simple
try {
  ajv.addKeyword("isEven", {
    validate: (schema, data) => {
      if (typeof data !== "number") return true
      return data % 2 === 0
    },
  })
  const schemaKeyword = {type: "number", isEven: true}
  const validateKeyword = ajv.compile(schemaKeyword)

  assert.strictEqual(validateKeyword(2), true, "Keyword valid should pass")
  assert.strictEqual(validateKeyword(3), false, "Keyword invalid should fail")
  console.log("✅ Custom keyword tests passed")
} catch (e) {
  console.error("❌ Custom keyword tests failed:", e)
  process.exit(1)
}

// Test addKeyword with schema config
try {
  ajv.addKeyword("minValue", {
    validate: (schema, data) => {
      return data >= schema
    },
  })
  const schemaConfig = {type: "number", minValue: 10}
  const validateConfig = ajv.compile(schemaConfig)

  assert.strictEqual(validateConfig(10), true, "Keyword config valid should pass")
  assert.strictEqual(validateConfig(9), false, "Keyword config invalid should fail")
  console.log("✅ Custom keyword with config tests passed")
} catch (e) {
  console.error("❌ Custom keyword config tests failed:", e)
  process.exit(1)
}
