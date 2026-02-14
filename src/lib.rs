use jsonschema::{
    paths::{LazyLocation, Location},
    Draft, Keyword, Retrieve, Uri, ValidationError, Validator,
};
use napi::bindgen_prelude::*;
use napi::sys;
use napi::{Env, JsFunction, Ref, JsUnknown};
use napi_derive::napi;
use serde_json::{Map, Value};
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;
use std::result::Result as StdResult;

#[cfg(not(any(target_arch = "arm", target_os = "freebsd", target_family = "wasm")))]
#[global_allocator]
static ALLOC: mimalloc_safe::MiMalloc = mimalloc_safe::MiMalloc;

// Thread-local buffer to avoid repeated allocations for simd-json parsing
thread_local! {
    static PARSE_BUF: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(256 * 1024));
    // Store the current napi_env for the main thread
    static CURRENT_ENV: RefCell<Option<sys::napi_env>> = RefCell::new(None);
}

/// Guard to clear the thread-local environment when dropped
struct EnvGuard;
impl Drop for EnvGuard {
    fn drop(&mut self) {
        CURRENT_ENV.with(|e| *e.borrow_mut() = None);
    }
}

// Wrapper for persistent JS function reference that implements Send + Sync (unsafe)
// We guarantee safety by only accessing the reference on the main thread via CURRENT_ENV
// We use Ref<()> which is the type-erased reference returned by create_reference
struct JsCallback(Ref<()>);
unsafe impl Send for JsCallback {}
unsafe impl Sync for JsCallback {}

struct JsKeyword {
    callback: Arc<JsCallback>,
    config: Value,
}

impl Keyword for JsKeyword {
    fn validate<'i>(
        &self,
        instance: &'i Value,
        _location: &LazyLocation,
    ) -> StdResult<(), ValidationError<'i>> {
        let success = CURRENT_ENV.with(|cell| -> bool {
            if let Some(raw_env) = *cell.borrow() {
                // Safety: We assume we are on the main thread where env is valid
                unsafe {
                    let env = Env::from_raw(raw_env);
                    // Retrieve function from reference
                    if let Ok(func) = env.get_reference_value::<JsFunction>(&self.callback.0) {
                        // Convert arguments to JS
                        // validate(schema, data) matches Ajv signature
                        let undefined = env.get_undefined().ok();
                        
                        let schema_js: JsUnknown = env.to_js_value(&self.config)
                            .or_else(|_| Ok::<JsUnknown, Error>(undefined.as_ref().unwrap().into_unknown()))
                            .unwrap();
                            
                        let data_js: JsUnknown = env.to_js_value(instance)
                            .or_else(|_| Ok::<JsUnknown, Error>(undefined.as_ref().unwrap().into_unknown()))
                            .unwrap();
                        
                        // Call JS function
                        if let Ok(result) = func.call(None, &[schema_js, data_js]) {
                             // Check boolean result
                             return result.coerce_to_bool()
                                 .and_then(|b| b.get_value())
                                 .unwrap_or(false);
                        }
                    }
                }
            }
            false // Fail if env missing or call fails
        });

        if success {
            Ok(())
        } else {
            Err(ValidationError::custom(
                Location::new(),
                Location::new(),
                instance,
                "Custom keyword validation failed",
            ))
        }
    }

    fn is_valid(&self, instance: &Value) -> bool {
         self.validate(instance, &LazyLocation::new()).is_ok()
    }
}

/// Custom schema retriever that uses pre-registered schemas
struct SchemaRetriever {
    schemas: Arc<HashMap<String, Value>>,
}

impl Retrieve for SchemaRetriever {
    fn retrieve(
        &self,
        uri: &Uri<String>,
    ) -> StdResult<Value, Box<dyn std::error::Error + Send + Sync>> {
        let uri_str = uri.as_str();

        // Try exact match first
        if let Some(schema) = self.schemas.get(uri_str) {
            return StdResult::Ok(schema.clone());
        }

        // Try without fragment
        let base_uri = uri_str.split('#').next().unwrap_or(uri_str);
        if let Some(schema) = self.schemas.get(base_uri) {
            return StdResult::Ok(schema.clone());
        }

        // Try with trailing slash variations
        let without_slash = base_uri.trim_end_matches('/');
        if let Some(schema) = self.schemas.get(without_slash) {
            return StdResult::Ok(schema.clone());
        }

        StdResult::Err(format!("Schema not found: {}", uri).into())
    }
}

#[napi]
pub struct Ajv {
    schemas: Arc<HashMap<String, Value>>,
    formats: Arc<HashMap<String, Arc<JsCallback>>>,
    keywords: Arc<HashMap<String, Arc<JsCallback>>>,
}

#[napi]
impl Ajv {
    #[napi(constructor)]
    pub fn new() -> Self {
        Ajv {
            schemas: Arc::new(HashMap::new()),
            formats: Arc::new(HashMap::new()),
            keywords: Arc::new(HashMap::new()),
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

    #[napi(ts_args_type = "(name: string, format: (data: string) => boolean)")]
    pub fn add_format(&mut self, env: Env, name: String, format: JsFunction) -> Result<()> {
        let reference = env.create_reference(format)?;
        let callback = Arc::new(JsCallback(reference));
        
        let formats = Arc::make_mut(&mut self.formats);
        formats.insert(name, callback);
        Ok(())
    }

    #[napi(ts_args_type = "(name: string, definition: (schema: any, data: any) => boolean)")]
    pub fn add_keyword(&mut self, env: Env, name: String, definition: JsFunction) -> Result<()> {
        let reference = env.create_reference(definition)?;
        let callback = Arc::new(JsCallback(reference));
        
        let keywords = Arc::make_mut(&mut self.keywords);
        keywords.insert(name, callback);
        Ok(())
    }

    #[napi]
    pub fn clear_cache(&mut self) {
        let schemas = Arc::make_mut(&mut self.schemas);
        schemas.clear();
        // We typically don't clear formats/keywords to match Ajv behavior?
        // But user can re-create Ajv instance. 
    }

    #[napi]
    pub fn compile(
        &self,
        schema: serde_json::Value,
        draft_uri: Option<String>,
        validate_formats: Option<bool>,
    ) -> Result<NapiValidator> {
        let retriever = SchemaRetriever {
            schemas: Arc::clone(&self.schemas),
        };

        let mut options = jsonschema::options();
        options = options.with_retriever(retriever);

        if let Some(validate) = validate_formats {
            options = options.should_validate_formats(validate);
        } else {
            options = options.should_validate_formats(true);
        }

        // Register custom formats
        for (name, callback) in self.formats.iter() {
            let cb = Arc::clone(callback);
            options = options.with_format(name.as_str(), move |data: &str| {
                CURRENT_ENV.with(|cell| -> bool {
                    if let Some(raw_env) = *cell.borrow() {
                        unsafe {
                            let env = Env::from_raw(raw_env);
                            if let Ok(func) = env.get_reference_value::<JsFunction>(&cb.0) {
                                if let Ok(arg) = env.create_string(data) {
                                    if let Ok(result) = func.call(None, &[arg]) {
                                        return result.coerce_to_bool()
                                            .and_then(|b| b.get_value())
                                            .unwrap_or(false);
                                    }
                                }
                            }
                        }
                    }
                    false
                })
            });
        }

        // Register custom keywords
        for (name, callback) in self.keywords.iter() {
            let cb = Arc::clone(callback);
            options = options.with_keyword(name.as_str(), move |_: &Map<String, Value>, config: &Value, _: Location| {
                let instance_cb = Arc::clone(&cb);
                let config_val = config.clone();
                // Factory returns a new Keyword instance
                Ok(Box::new(JsKeyword {
                    callback: instance_cb,
                    config: config_val,
                }))
            });
        }

        if let Some(uri) = draft_uri {
            let normalized = uri.trim_end_matches('#');
            if let Some(draft) = match normalized {
                "http://json-schema.org/draft-04/schema" => Some(Draft::Draft4),
                "http://json-schema.org/draft-06/schema" => Some(Draft::Draft6),
                "http://json-schema.org/draft-07/schema" => Some(Draft::Draft7),
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
    pub fn validate(&self, env: Env, data: serde_json::Value) -> Result<ValidationResult> {
        self.with_env(env, |v| v.validate_impl(&data))
    }

    #[napi(js_name = "validateString")]
    pub fn validate_string(&self, env: Env, data_str: String) -> Result<ValidationResult> {
        let data: Value = serde_json::from_str(&data_str)
            .map_err(|e| Error::from_reason(format!("Invalid JSON: {}", e)))?;
        self.with_env(env, |v| v.validate_impl(&data))
    }

    #[napi(js_name = "validateBuffer")]
    pub fn validate_buffer(&self, env: Env, buffer: Buffer) -> Result<ValidationResult> {
        self.with_env(env, |v| {
            PARSE_BUF.with(|buf| {
                let mut buf = buf.borrow_mut();
                buf.clear();
                buf.extend_from_slice(&buffer);
                let data: Value = simd_json::serde::from_slice(&mut buf)
                    .map_err(|e| Error::from_reason(format!("Invalid JSON: {}", e)))?;
                v.validate_impl(&data)
            })
        })
    }

    #[napi(js_name = "isValidBuffer")]
    pub fn is_valid_buffer(&self, env: Env, buffer: Buffer) -> Result<bool> {
        self.with_env(env, |v| {
            PARSE_BUF.with(|buf| {
                let mut buf = buf.borrow_mut();
                buf.clear();
                buf.extend_from_slice(&buffer);
                let data: Value = simd_json::serde::from_slice(&mut buf)
                    .map_err(|e| Error::from_reason(format!("Invalid JSON: {}", e)))?;
                Ok(v.validator.is_valid(&data))
            })
        })
    }

    #[napi(js_name = "isValidString")]
    pub fn is_valid_string(&self, env: Env, data_str: String) -> Result<bool> {
        self.with_env(env, |v| {
            let data: Value = serde_json::from_str(&data_str)
                .map_err(|e| Error::from_reason(format!("Invalid JSON: {}", e)))?;
            Ok(v.validator.is_valid(&data))
        })
    }

    fn with_env<F, R>(&self, env: Env, f: F) -> Result<R>
    where
        F: FnOnce(&Self) -> Result<R>,
    {
        CURRENT_ENV.with(|e| *e.borrow_mut() = Some(env.raw()));
        let _guard = EnvGuard;
        f(self)
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
