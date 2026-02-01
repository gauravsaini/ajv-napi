use jsonschema::{Draft, Retrieve, Uri, Validator};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;

use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

// Thread-local buffer to avoid repeated allocations for simd-json parsing
thread_local! {
    static PARSE_BUF: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(256 * 1024));
}

/// Custom schema retriever that uses pre-registered schemas
struct SchemaRetriever {
    schemas: Arc<HashMap<String, Value>>,
}

impl Retrieve for SchemaRetriever {
    fn retrieve(
        &self,
        uri: &Uri<String>,
    ) -> std::result::Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        let uri_str = uri.as_str();

        // Try exact match first
        if let Some(schema) = self.schemas.get(uri_str) {
            return std::result::Result::Ok(schema.clone());
        }

        // Try without fragment
        let base_uri = uri_str.split('#').next().unwrap_or(uri_str);
        if let Some(schema) = self.schemas.get(base_uri) {
            return std::result::Result::Ok(schema.clone());
        }

        // Try with trailing slash variations
        let without_slash = base_uri.trim_end_matches('/');
        if let Some(schema) = self.schemas.get(without_slash) {
            return std::result::Result::Ok(schema.clone());
        }

        std::result::Result::Err(format!("Schema not found: {}", uri).into())
    }
}

#[napi]
pub struct Ajv {
    schemas: Arc<HashMap<String, Value>>,
}

#[napi]
impl Ajv {
    #[napi(constructor)]
    pub fn new() -> Self {
        Ajv {
            schemas: Arc::new(HashMap::new()),
        }
    }

    #[napi]
    pub fn add_schema(&mut self, schema: serde_json::Value, key: Option<String>) -> Result<()> {
        let id = if let Some(k) = key {
            k
        } else {
            if let Some(id_val) = schema.get("$id").or_else(|| schema.get("id")) {
                if let Some(id_str) = id_val.as_str() {
                    id_str.to_string()
                } else {
                    return Err(Error::from_reason("Schema ID must be a string"));
                }
            } else {
                "unknown".to_string()
            }
        };

        // Get mutable access to the inner HashMap
        let schemas = Arc::make_mut(&mut self.schemas);
        schemas.insert(id, schema);
        Ok(())
    }

    #[napi]
    pub fn compile(
        &self,
        schema: serde_json::Value,
        draft_uri: Option<String>,
    ) -> Result<NapiValidator> {
        // Create retriever with registered schemas
        let retriever = SchemaRetriever {
            schemas: Arc::clone(&self.schemas),
        };

        // Enable format validation to pass strict Ajv tests
        let mut options = jsonschema::options();
        options = options
            .with_retriever(retriever)
            .should_validate_formats(true);

        if let Some(uri) = draft_uri {
            if let Some(draft) = match uri.as_str() {
                "http://json-schema.org/draft-04/schema#" => Some(Draft::Draft4),
                "http://json-schema.org/draft-06/schema#" => Some(Draft::Draft6),
                "http://json-schema.org/draft-07/schema#" => Some(Draft::Draft7),
                "https://json-schema.org/draft/2019-09/schema" => Some(Draft::Draft201909),
                "https://json-schema.org/draft/2020-12/schema" => Some(Draft::Draft202012),
                _ => None,
            } {
                options = options.with_draft(draft);
            }
        }

        let validator = options
            .build(&schema)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        Ok(NapiValidator { validator })
    }
}

#[napi]
pub struct NapiValidator {
    validator: Validator,
}

#[napi(object)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Option<Vec<AjvError>>,
}

#[napi(object)]
pub struct AjvError {
    pub message: String,
    pub instance_path: String,
    pub schema_path: String,
}

#[napi]
impl NapiValidator {
    #[napi]
    pub fn validate(&self, data: serde_json::Value) -> Result<ValidationResult> {
        self.validate_impl(&data)
    }

    #[napi(js_name = "validateString")]
    pub fn validate_string(&self, data_str: String) -> Result<ValidationResult> {
        let data: Value = serde_json::from_str(&data_str)
            .map_err(|e| Error::from_reason(format!("Invalid JSON: {}", e)))?;

        self.validate_impl(&data)
    }

    #[napi(js_name = "validateBuffer")]
    pub fn validate_buffer(&self, buffer: Buffer) -> Result<ValidationResult> {
        // Use thread-local buffer with simd-json for faster parsing
        PARSE_BUF.with(|buf| {
            let mut buf = buf.borrow_mut();
            buf.clear();
            buf.extend_from_slice(&buffer);

            // simd_json::serde::from_slice deserializes to serde_json::Value
            let data: Value = simd_json::serde::from_slice(&mut buf)
                .map_err(|e| Error::from_reason(format!("Invalid JSON: {}", e)))?;

            self.validate_impl(&data)
        })
    }

    /// Fast path - only returns validity, no error details
    #[napi(js_name = "isValidBuffer")]
    pub fn is_valid_buffer(&self, buffer: Buffer) -> Result<bool> {
        PARSE_BUF.with(|buf| {
            let mut buf = buf.borrow_mut();
            buf.clear();
            buf.extend_from_slice(&buffer);

            let data: Value = simd_json::serde::from_slice(&mut buf)
                .map_err(|e| Error::from_reason(format!("Invalid JSON: {}", e)))?;

            Ok(self.validator.is_valid(&data))
        })
    }

    /// Fast path for string input - only returns validity
    #[napi(js_name = "isValidString")]
    pub fn is_valid_string(&self, data_str: String) -> Result<bool> {
        let data: Value = serde_json::from_str(&data_str)
            .map_err(|e| Error::from_reason(format!("Invalid JSON: {}", e)))?;

        Ok(self.validator.is_valid(&data))
    }

    fn validate_impl(&self, data: &Value) -> Result<ValidationResult> {
        if self.validator.is_valid(data) {
            Ok(ValidationResult {
                valid: true,
                errors: None,
            })
        } else {
            let errors = self
                .validator
                .iter_errors(data)
                .map(|e| AjvError {
                    message: e.to_string(),
                    instance_path: e.instance_path.to_string(),
                    schema_path: e.schema_path.to_string(),
                })
                .collect();

            Ok(ValidationResult {
                valid: false,
                errors: Some(errors),
            })
        }
    }
}
