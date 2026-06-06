const {Ajv: NapiAjv} = require("./index.js")

class Ajv {
  constructor(opts) {
    this.napiAjv = new NapiAjv()
    this.opts = opts || {}
    this.opts.code = this.opts.code || {}
    this.errors = null
    this.schemasCache = new Map()
  }

  compile(schema, opts) {
    let validator
    const draft = this.opts.defaultMeta
    const validateFormats = opts?.validateFormats ?? this.opts.validateFormats ?? true

    try {
      validator = this.napiAjv.compile(schema, draft, validateFormats)
    } catch (e) {
      throw new Error("Schema compilation failed: " + e)
    }
    const validate = (data) => {
      const errors = validator.validate(data)

      if (errors === null) {
        validate.errors = null
        return true
      } else {
        validate.errors = formatErrors(errors, schema)
        return false
      }
    }

    validate.validateBuffer = (buffer) => {
      // Fast path: use validateBuffer directly
      const errors = validator.validateBuffer(buffer)
      if (errors === null) {
        validate.errors = null
        return true
      } else {
        validate.errors = formatErrors(errors, schema)
        return false
      }
    }

    validate.isValidBuffer = (buffer) => {
      return validator.isValidBuffer(buffer)
    }

    validate.validateString = (str) => {
      const buf = Buffer.from(str, 'utf8')
      return validate.validateBuffer(buf)
    }

    validate.isValidString = (str) => {
      const buf = Buffer.from(str, 'utf8')
      return validate.isValidBuffer(buf)
    }

    validate.schema = schema
    validate.errors = null

    // Cache the schema by its ID if present
    const id = schema.$id || schema.id
    if (id && typeof id === "string") {
      this.schemasCache.set(id, validate)
    }

    return validate
  }

  validate(schema, data) {
    const v = this.compile(schema)
    const valid = v(data)
    this.errors = v.errors
    return valid
  }

  addSchema(schema, key) {
    if (Array.isArray(schema)) {
      schema.forEach((s) => this.addSchema(s))
      return this
    }
    try {
      this.napiAjv.addSchema(schema, key)
    } catch (e) {}

    // Compile and cache
    const validate = this.compile(schema)
    if (key && typeof key === "string") {
      this.schemasCache.set(key, validate)
    }
    return this
  }

  getSchema(key) {
    if (typeof key === "string") {
      return this.schemasCache.get(key)
    }
    return undefined
  }

  addFormat(name, format) {
    if (format && typeof format === "object" && format instanceof RegExp) {
      const re = format
      format = (s) => re.test(s)
    }
    if (typeof format === "function") {
      try {
        this.napiAjv.addFormat(name, format)
      } catch (e) {
        // Ignore error if not implemented or fails, to maintain drop-in compatibility
      }
    }
    return this
  }

  addKeyword(keyword, definition) {
    if (typeof keyword === "object") {
      definition = keyword
      keyword = definition.keyword
    }

    if (
      typeof keyword === "string" &&
      typeof definition === "object" &&
      definition.validate &&
      typeof definition.validate === "function"
    ) {
      try {
        this.napiAjv.addKeyword(keyword, definition.validate)
      } catch (e) {
        // Ignore error
      }
    }
    return this
  }

  addMetaSchema(schema, key) {
    return this.addSchema(schema, key)
  }

  removeSchema(schemaKey) {
    if (schemaKey === undefined) {
      this.napiAjv.clearCache()
      this.schemasCache.clear()
    } else if (typeof schemaKey === "string") {
      this.schemasCache.delete(schemaKey)
    }
    return this
  }
}

function formatErrors(rawErrors, schema) {
  if (!rawErrors) return null
  return rawErrors.map(err => {
    // Extract keyword from the last part of schemaPath
    const pathParts = err.schemaPath.split('/').filter(Boolean)
    const keyword = pathParts[pathParts.length - 1] || ""

    // Prepend "#" to schemaPath
    const schemaPath = "#" + err.schemaPath

    // Reconstruct params by resolving schemaPath inside raw schema
    let params = {}
    try {
      let constraintValue = schema
      for (const part of pathParts) {
        if (constraintValue && typeof constraintValue === 'object') {
          constraintValue = constraintValue[part]
        } else {
          constraintValue = undefined
          break
        }
      }

      if (constraintValue !== undefined) {
        if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties'].includes(keyword)) {
          params = { limit: constraintValue }
        } else if (keyword === 'required') {
          // Extract the missing field name from the end of the instancePath
          const missing = err.instancePath.split('/').pop()
          params = { missingProperty: missing }
        } else if (keyword === 'additionalProperties') {
          const match = err.message.match(/'([^']+)'/)
          params = { additionalProperty: match ? match[1] : "" }
        } else if (keyword === 'type') {
          params = { type: constraintValue }
        } else if (keyword === 'enum') {
          params = { allowedValues: constraintValue }
        } else if (keyword === 'pattern') {
          params = { pattern: constraintValue }
        } else if (keyword === 'const') {
          params = { allowedValue: constraintValue }
        } else if (keyword === 'multipleOf') {
          params = { multipleOf: constraintValue }
        }
      }
    } catch (e) {
      // Fallback silently if resolution fails
    }

    return {
      instancePath: err.instancePath,
      schemaPath,
      keyword,
      params,
      message: err.message
    }
  })
}

module.exports = Ajv
module.exports.default = Ajv
