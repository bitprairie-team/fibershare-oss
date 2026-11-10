//! Browser island. Native builds export nothing the server needs.

#[cfg(target_arch = "wasm32")]
mod island;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn start() {
    island::boot();
}
