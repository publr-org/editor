// Editing policy: what may be inserted, moved, removed, edited and formatted. Policy is
// editor configuration, never content: nothing in loaded HTML can loosen it (upcast
// keeps only carriers, classes and children). It is scoped, not cascaded: the root
// level governs top-level blocks, a container type's entry governs that container's
// direct children, and block-type entries govern blocks of that type wherever they are.
import { blockType } from "./registry";
import { locate } from "./tree";
import type { Block, Model } from "./types";
import { RAW_TYPE } from "./types";

export type BlockRules = {
  editable?: boolean;
  movable?: boolean;
  removable?: boolean;
  duplicable?: boolean;
  /** The inline formats a rich field offers; absent means all. */
  allowedFormats?: readonly string[];
};

export type LevelRules = {
  /** The block types insertion offers here: a list, `true` for all, `false` for none. */
  allowedBlocks?: readonly string[] | boolean;
  orderable?: boolean;
};

export type PolicyConfig = LevelRules & {
  /** Editing a template: template-only blocks (parts, slots) may be inserted. */
  template?: boolean;
  /** `content-only` (alias `fixed`): typeable text, locked structure and design. */
  preset?: "content-only" | "fixed";
  blocks?: Readonly<Record<string, BlockRules>>;
  /** Container block type → rules for its direct children. */
  slots?: Readonly<Record<string, LevelRules>>;
};

export const FORMATS = ["bold", "italic", "link", "strikethrough", "code", "subscript", "superscript"] as const;

export class Policy {
  readonly config: PolicyConfig;
  private readonly contentOnly: boolean;

  constructor(config: PolicyConfig = {}) {
    this.config = config;
    this.contentOnly = config.preset === "content-only" || config.preset === "fixed";
  }

  /** Design and structure controls are refused; only content stays writable. */
  get designLocked(): boolean {
    return this.contentOnly;
  }

  private rules(block: Block): BlockRules {
    const preset: BlockRules = this.contentOnly ? { movable: false, removable: false, duplicable: false } : {};
    return { ...preset, ...this.config.blocks?.[block.type] };
  }

  private level(model: Model, parentId: string | null): LevelRules {
    if (parentId === null) {
      const preset: LevelRules = this.contentOnly ? { allowedBlocks: false, orderable: false } : {};
      return { ...preset, allowedBlocks: this.config.allowedBlocks ?? preset.allowedBlocks, orderable: this.config.orderable ?? preset.orderable };
    }
    const parent = locate(model, parentId)?.block;
    const scoped = parent ? this.config.slots?.[parent.type] : undefined;
    const preset: LevelRules = this.contentOnly ? { allowedBlocks: false, orderable: false } : {};
    return { ...preset, ...scoped };
  }

  isEditable(block: Block): boolean {
    return block.type !== RAW_TYPE && this.rules(block).editable !== false;
  }

  canRemove(block: Block): boolean {
    return this.rules(block).removable !== false;
  }

  canDuplicate(model: Model, block: Block): boolean {
    if (this.rules(block).duplicable === false) return false;
    const location = locate(model, block.id);
    return location !== null && this.canInsert(model, location.parent?.id ?? null, location.slot, block.type);
  }

  canMove(model: Model, block: Block): boolean {
    if (this.rules(block).movable === false) return false;
    const location = locate(model, block.id);
    if (!location) return false;
    return this.level(model, location.parent?.id ?? null).orderable !== false;
  }

  /** The formats a rich field of `block` offers. */
  formats(block: Block): readonly string[] {
    return this.rules(block).allowedFormats ?? FORMATS;
  }

  /** Whether insertion is offered at all under `parentId` (null: the top level). */
  canInsertAny(model: Model, parentId: string | null): boolean {
    return this.level(model, parentId).allowedBlocks !== false;
  }

  /** Whether a block of `type` may be inserted (or moved) into `slot` of `parentId`. */
  canInsert(model: Model, parentId: string | null, slot: string | null, type: string): boolean {
    const allowed = this.level(model, parentId).allowedBlocks;
    if (allowed === false) return false;
    if (Array.isArray(allowed) && !allowed.includes(type)) return false;
    // An internal block (a column, a list item) goes only where its parent's slot names it.
    let slotAllow: readonly string[] | undefined;
    if (parentId !== null) {
      const parent = locate(model, parentId)?.block;
      const definition = parent ? blockType(parent.type) : null;
      slotAllow = slot ? definition?.allow?.[slot] : undefined;
      if (slotAllow && !slotAllow.includes(type)) return false;
    }
    if (blockType(type)?.internal && !slotAllow?.includes(type)) return false;
    if (blockType(type)?.templateOnly && !this.config.template) return false;
    return true;
  }
}
