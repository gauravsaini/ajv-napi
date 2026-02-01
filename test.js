/**
 * ajv-napi Test Suite
 *
 * This runs the JSON Schema Test Suite against the NAPI implementation
 * to verify 100% compliance with the spec.
 */

const Ajv = require("./wrapper.js")
const path = require("path")
const fs = require("fs")

// Load remote schemas from the test suite
const remotesDir = path.join(__dirname, "../spec/JSON-Schema-Test-Suite/remotes")

function loadRemotesRecursively(dir, baseUrl = "http://localhost:1234") {
  const remotes = {}

  if (!fs.existsSync(dir)) {
    console.warn("Remotes directory not found:", dir)
    return remotes
  }

  const items = fs.readdirSync(dir, {withFileTypes: true})

  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    const relativePath = path.relative(remotesDir, fullPath)

    if (item.isDirectory()) {
      Object.assign(remotes, loadRemotesRecursively(fullPath, baseUrl))
    } else if (item.name.endsWith(".json")) {
      const url = `${baseUrl}/${relativePath}`
      try {
        remotes[url] = JSON.parse(fs.readFileSync(fullPath, "utf8"))
      } catch (e) {
        console.warn("Failed to load remote:", url, e.message)
      }
    }
  }

  return remotes
}

// Load test suite
function loadTestSuite(draft, includeOptional = false) {
  const testsDir = path.join(__dirname, "../spec/JSON-Schema-Test-Suite/tests", draft)
  const tests = []

  if (!fs.existsSync(testsDir)) {
    console.warn("Tests directory not found:", testsDir)
    return tests
  }

  // Load main tests
  const files = fs.readdirSync(testsDir).filter((f) => f.endsWith(".json"))
  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(testsDir, file), "utf8"))
      tests.push({file, suites: content, optional: false})
    } catch (e) {
      console.warn("Failed to load test file:", file, e.message)
    }
  }

  // Load optional tests
  if (includeOptional) {
    const optionalDir = path.join(testsDir, "optional")
    if (fs.existsSync(optionalDir)) {
      const loadOptionalRecursively = (dir, prefix = "optional/") => {
        const items = fs.readdirSync(dir, {withFileTypes: true})
        for (const item of items) {
          const fullPath = path.join(dir, item.name)
          if (item.isDirectory()) {
            loadOptionalRecursively(fullPath, prefix + item.name + "/")
          } else if (item.name.endsWith(".json")) {
            try {
              const content = JSON.parse(fs.readFileSync(fullPath, "utf8"))
              tests.push({file: prefix + item.name, suites: content, optional: true})
            } catch (e) {
              console.warn("Failed to load optional test file:", prefix + item.name, e.message)
            }
          }
        }
      }
      loadOptionalRecursively(optionalDir)
    }
  }

  return tests
}

// Map draft folder names to meta-schema URIs
const DRAFT_META_SCHEMAS = {
  draft4: "http://json-schema.org/draft-04/schema#",
  draft6: "http://json-schema.org/draft-06/schema#",
  draft7: "http://json-schema.org/draft-07/schema#",
  "draft2019-09": "https://json-schema.org/draft/2019-09/schema",
  "draft2020-12": "https://json-schema.org/draft/2020-12/schema",
}

// Run tests
function runTests(includeOptional = true) {
  const remotes = loadRemotesRecursively(remotesDir)
  console.log(`Loaded ${Object.keys(remotes).length} remote schemas`)

  const drafts = ["draft7"] // Start with draft7
  let totalPassed = 0
  let totalFailed = 0
  let optionalPassed = 0
  let optionalFailed = 0
  const failures = []

  for (const draft of drafts) {
    console.log(`\nTesting ${draft}${includeOptional ? " (including optional)" : ""}...`)
    const testFiles = loadTestSuite(draft, includeOptional)
    const defaultMeta = DRAFT_META_SCHEMAS[draft]

    for (const {file, suites, optional} of testFiles) {
      for (const suite of suites) {
        const ajv = new Ajv({defaultMeta})

        // Add all remote schemas
        for (const [url, schema] of Object.entries(remotes)) {
          ajv.addSchema(schema, url)
        }

        let validate
        try {
          validate = ajv.compile(suite.schema)
        } catch (e) {
          // Schema compilation failed - count all tests as failed
          for (const test of suite.tests) {
            totalFailed++
            failures.push({
              file,
              description: suite.description,
              test: test.description,
              error: `Compile error: ${e.message}`,
            })
          }
          continue
        }

        for (const test of suite.tests) {
          const result = validate(test.data)

          if (result === test.valid) {
            if (optional) {
              optionalPassed++
            } else {
              totalPassed++
            }
          } else {
            if (optional) {
              optionalFailed++
            } else {
              totalFailed++
            }
            failures.push({
              file,
              description: suite.description,
              test: test.description,
              expected: test.valid,
              got: result,
              errors: validate.errors,
              optional,
            })
          }
        }
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`)
  console.log(`Required tests: ${totalPassed} passed, ${totalFailed} failed`)
  if (includeOptional) {
    console.log(`Optional tests: ${optionalPassed} passed, ${optionalFailed} failed`)
  }
  const total = totalPassed + totalFailed
  console.log(`Required pass rate: ${((totalPassed / total) * 100).toFixed(2)}%`)

  if (failures.length > 0) {
    const requiredFailures = failures.filter((f) => !f.optional)
    const optionalFailures = failures.filter((f) => f.optional)

    if (requiredFailures.length > 0) {
      console.log(`\nRequired failures (${requiredFailures.length}):`)
      for (const f of requiredFailures) {
        console.log(`  - ${f.file}: ${f.description} / ${f.test}`)
        if (f.error) {
          console.log(`    Error: ${f.error}`)
        } else {
          console.log(`    Expected: ${f.expected}, Got: ${f.got}`)
        }
      }
    }

    if (optionalFailures.length > 0 && process.argv.includes("--show-optional")) {
      console.log(`\nOptional failures (${optionalFailures.length}):`)
      for (const f of optionalFailures) {
        console.log(`  - ${f.file}: ${f.description} / ${f.test}`)
        if (f.error) {
          console.log(`    Error: ${f.error}`)
        } else {
          console.log(`    Expected: ${f.expected}, Got: ${f.got}`)
        }
      }
    }
  }

  return {passed: totalPassed, failed: totalFailed, optionalPassed, optionalFailed, failures}
}

// Run if executed directly
if (require.main === module) {
  runTests()
}

module.exports = {runTests, loadRemotesRecursively, loadTestSuite}
