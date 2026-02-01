const {Ajv: NapiAjv} = require("./index.js")

class Ajv {
  constructor(opts) {
    this.napiAjv = new NapiAjv()
    this.opts = opts || {}
    this.opts.code = this.opts.code || {}
    this.errors = null
  }

  compile(schema) {
    let validator
    const draft = this.opts.defaultMeta

    try {
      validator = this.napiAjv.compile(schema, draft)
    } catch (e) {
      throw new Error("Schema compilation failed: " + e)
    }

    const validate = (data) => {
      let result
      try {
        const jsonStr = JSON.stringify(data)
        if (jsonStr === undefined) {
          result = validator.validate(data)
        } else {
          result = validator.validateString(jsonStr)
        }
      } catch (e) {
        result = validator.validate(data)
      }

      if (result.valid) {
        validate.errors = null
        return true
      } else {
        validate.errors = result.errors
        return false
      }
    }

    validate.validateBuffer = (buffer) => {
      // Fast path: use validateBuffer directly
      const result = validator.validateBuffer(buffer)
      if (result.valid) {
        validate.errors = null
        return true
      } else {
        validate.errors = result.errors
        return false
      }
    }

    validate.isValidBuffer = (buffer) => {
      return validator.isValidBuffer(buffer)
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
    return this
  }

  addKeyword(definition) {
    return this
  }

  addMetaSchema(schema, key) {
    return this.addSchema(schema, key)
  }
}

module.exports = Ajv
module.exports.default = Ajv
