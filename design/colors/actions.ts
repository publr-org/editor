// Semantic colors' actions: picking a context, adding, renaming and removing contexts
// and roles, and assigning a palette color to a role in the chosen context.
import { Publr } from "publr-jsx";
import { builder } from "../Builder.ptsx";
import { mountLivePreview } from "../../shell/preview";
import { downcast, upcastBlocks } from "../../model/codec";
import { colorContexts, fontStylesheets, semanticRoles, setToken } from "../model/system";
import { addContext, addRole, removeContext, removeRole, renameContext, updateRole } from "../model/roles";
import { requestRemoval } from "../removal/actions";

export function selectContext(key: string): void {
  const b = builder();
  if (!colorContexts(b.system()).some((context) => context.key === key)) return;
  b.state.colorContext = key;
  b.state.semanticOpen = "";
  b.state.colorLevel = "roles";
  b.state.colorError = "";
  b.refresh();
}

export function showContexts(): void {
  const b = builder();
  b.state.colorLevel = "contexts";
  b.state.semanticOpen = "";
  b.state.colorError = "";
}

export function toggleContextForm(): void {
  const b = builder();
  b.state.contextFormOpen = !b.state.contextFormOpen;
  b.state.colorError = "";
}

export function toggleRoleForm(): void {
  const b = builder();
  b.state.roleFormOpen = !b.state.roleFormOpen;
  b.state.colorError = "";
}

export function setColorField(field: "contextName" | "contextKey" | "roleName" | "roleKey", value: string): void {
  builder().state[field] = value;
}

export function submitContext(): void {
  const b = builder();
  const outcome = addContext(b.system(), b.state.contextName, b.state.contextKey, b.state.colorContext);
  if (!outcome.system) {
    b.state.colorError = outcome.error;
    return;
  }
  const key = outcome.system.contexts[outcome.system.contexts.length - 1].key;
  b.state.colorContext = key;
  b.state.contextFormOpen = false;
  b.state.colorLevel = "roles";
  b.state.colorError = "";
  b.state.contextName = "";
  b.state.contextKey = "";
  b.change(outcome.system);
}

export function renameCurrentContext(label: string): void {
  const b = builder();
  const next = renameContext(b.system(), b.state.colorContext, label);
  if (next === b.system()) b.refresh();
  else b.change(next);
}

export function removeCurrentContext(): void {
  const b = builder();
  const key = b.state.colorContext;
  const contexts = colorContexts(b.system());
  const context = contexts.find((candidate) => candidate.key === key);
  if (!context || key === "default") return;
  requestRemoval({
    title: Publr.t("Remove the {name} context?", { name: context.label }),
    // A context's usages are `bg-<context>-<role>` classes and `var(--color-<context>-…)`
    // references: moved to another context, or to the default by dropping the segment.
    refs: [{ kind: "colorContext", key }],
    alternatives: contexts.filter((candidate) => candidate.key !== key).map((candidate) => ({ key: candidate.key, label: candidate.label })),
    apply: (system) => {
      b.state.colorContext = "default";
      b.state.semanticOpen = "";
      b.state.colorLevel = "contexts";
      return removeContext(system, key);
    },
  });
}

export function submitRole(): void {
  const b = builder();
  const outcome = addRole(b.system(), b.state.roleName, b.state.roleKey);
  if (!outcome.system) {
    b.state.colorError = outcome.error;
    return;
  }
  b.state.roleFormOpen = false;
  b.state.colorError = "";
  b.state.roleName = "";
  b.state.roleKey = "";
  b.change(outcome.system);
}

export function editRole(key: string, field: "label" | "description", text: string): void {
  const b = builder();
  const next = updateRole(b.system(), key, field, text);
  if (next === b.system()) b.refresh();
  else b.change(next);
}

export function removeRoleNamed(key: string): void {
  const b = builder();
  const roles = semanticRoles(b.system());
  const role = roles.find((candidate) => candidate.key === key);
  if (roles.length <= 1 || !role) {
    b.state.colorError = Publr.t("Keep at least one semantic role.");
    return;
  }
  requestRemoval({
    title: Publr.t("Remove the {name} role?", { name: role.label }),
    // A role is used as `bg-<role>` in every context; its usages move to another role.
    refs: [{ kind: "semanticRole", key, contexts: colorContexts(b.system()).map((context) => context.key) }],
    alternatives: roles.filter((candidate) => candidate.key !== key).map((candidate) => ({ key: candidate.key, label: candidate.label })),
    apply: (system) => {
      b.state.semanticOpen = "";
      return removeRole(system, key);
    },
  });
}

export function toggleSemantic(name: string): void {
  const b = builder();
  b.state.semanticOpen = b.state.semanticOpen === name ? "" : name;
  b.refresh();
}

/** Points the role's token in the chosen context at a palette color. */
export function setSemanticToken(name: string, reference: string): void {
  const b = builder();
  b.change(setToken(b.system(), name, reference));
}

export function manageColors(): void {
  builder().open("advanced");
}

/** The preview host's ref: draws now and whenever the view's stamp changes. */
export function attachPreview(host: Element | null): void {
  if (!host) return;
  const b = builder();
  const draw = () => {
    const system = b.system();
    const html = downcast(upcastBlocks(b.state.colorPreview), "data");
    mountLivePreview(host as HTMLElement, html, [...(b.props.siteStyles ?? []), ...fontStylesheets(system)], system.tokens);
  };
  queueMicrotask(draw);
  new MutationObserver(draw).observe(host, { attributes: true, attributeFilter: ["data-preview-stamp"] });
}
