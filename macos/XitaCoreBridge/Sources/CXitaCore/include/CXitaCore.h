#ifndef CXITA_CORE_H
#define CXITA_CORE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* xita-core (Rust) C ABI — UTF-8 JSON 문자열 반환, xita_free_string 로 해제 */
char* xita_ws_open(const char* path);
char* xita_ws_apply_op(const char* path,
                       const char* op_id,
                       const char* device_id,
                       const char* target,
                       const char* target_id,
                       uint64_t base_revision,
                       const char* kind,
                       const char* field_key,
                       const char* field_value);
char* xita_ws_pull(const char* path, uint64_t cursor);
char* xita_ws_index_rebuild(const char* path);
void xita_free_string(char* s);


/* --- v0.5 Phase 6 확장 (multi-field op / handoff / agents / git) --- */
char* xita_ws_apply_op_multi(const char* path,
                             const char* op_id,
                             const char* device_id,
                             const char* target,
                             const char* target_id,
                             uint64_t base_revision,
                             const char* kind,
                             const char* fields_tsv);
char* xita_build_handoff(const char* path, const char* product_id, const char* change_id);
char* xita_detect_agents(void);
char* xita_git_inspect(const char* dir);
char* xita_ws_conflicts(const char* path);
char* xita_ws_get_doc(const char* path, const char* target, const char* id);
char* xita_valid_transitions(const char* current);
char* xita_ws_set_body(const char* path, const char* target, const char* id, const char* body);
char* xita_apply_ship_template(const char* path, const char* product_id, const char* product_type);
char* xita_patch_readiness(const char* path, const char* product_id, const char* kind, const char* item, const char* status, uint64_t progress);
char* xita_ws_readiness(const char* path, const char* product_id);
char* xita_ws_approve_change(const char* path, const char* change_id);
char* xita_ship_template_preview(const char* product_type);

#ifdef __cplusplus
}
#endif


#endif /* CXITA_CORE_H */
