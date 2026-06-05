const {Ajv: NapiAjv} = require("./index.js")

class Ajv {
  constructor(opts) {
    this.napiAjv = new NapiAjv()
    this.opts = opts || {}
    this.opts.code = this.opts.code || {}
    this.errors = null
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
        validate.errors = errors
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
        validate.errors = errors
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
    return this
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
        // console.warn("ajv-napi: addFormat failed", e)
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
        // console.warn("ajv-napi: addKeyword failed", e)
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
    }
    // TODO: Implement removing single schema by key
    return this
  }
}

module.exports = Ajv
module.exports.default = Ajv
