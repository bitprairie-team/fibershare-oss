//! Follow a fiber lot back to its fleeces, shearings, and animals.

use serde_json::{json, Map, Value};

pub fn trace_lot(lot_id: &str, records: &Value) -> Option<Value> {
    let lot = records
        .get("lots")?
        .as_array()?
        .iter()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(lot_id))?
        .clone();
    let fleece_ids = lot
        .get("fleeceIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let fleeces: Vec<Value> = records
        .get("fleeces")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|item| {
            fleece_ids
                .iter()
                .any(|id| id == item.get("id").unwrap_or(&Value::Null))
        })
        .cloned()
        .collect();
    let steps: Vec<Value> = fleeces
        .iter()
        .map(|fleece| {
            let shearing = records
                .get("shearings")
                .and_then(Value::as_array)
                .and_then(|list| {
                    list.iter()
                        .find(|item| item.get("id") == fleece.get("shearingId"))
                        .cloned()
                });
            let animal = shearing.as_ref().and_then(|shearing| {
                records
                    .get("animals")
                    .and_then(Value::as_array)
                    .and_then(|list| {
                        list.iter()
                            .find(|item| item.get("id") == shearing.get("animalId"))
                            .cloned()
                    })
            });
            json!({"fleece": fleece, "shearing": shearing, "animal": animal})
        })
        .collect();
    Some(json!({"lot": lot, "steps": steps}))
}

pub fn visible_record(record: Option<&Value>, viewer: &str) -> Option<Value> {
    let record = record?;
    if viewer == "rancher" {
        let mut fields = record.as_object().cloned().unwrap_or_default();
        fields.remove("sharing");
        return Some(
            json!({"id": record.get("id"), "fields": Value::Object(fields), "hidden": []}),
        );
    }
    let audience = record
        .pointer("/sharing/audience")
        .and_then(Value::as_str)
        .unwrap_or("private");
    let allowed = (viewer == "buyers" && (audience == "buyers" || audience == "public"))
        || (viewer == "public" && audience == "public");
    if !allowed {
        return None;
    }
    let shared: Vec<String> = record
        .pointer("/sharing/fields")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let mut fields = Map::new();
    let mut hidden = Vec::new();
    for (key, value) in record.as_object()? {
        if key == "sharing" || key == "id" {
            continue;
        }
        if shared.iter().any(|name| name == key) {
            fields.insert(key.clone(), value.clone());
        } else {
            hidden.push(json!(key));
        }
    }
    Some(json!({"id": record.get("id"), "fields": fields, "hidden": hidden}))
}
