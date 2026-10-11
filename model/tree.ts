// Walking the block tree: where a block lives, its path from the top, its neighbours.
import type { Block, Model } from "./types";

/** Where a block sits: the list holding it, at which index, under which parent slot. */
export type Location = {
  block: Block;
  list: Block[];
  index: number;
  parent: Block | null;
  slot: string | null;
};

export function locate(model: Model, id: string): Location | null {
  const visit = (list: Block[], parent: Block | null, slot: string | null): Location | null => {
    for (let index = 0; index < list.length; index++) {
      const block = list[index];
      if (block.id === id) return { block, list, index, parent, slot };
      for (const [name, children] of Object.entries(block.slots ?? {})) {
        const found = visit(children, block, name);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(model.blocks, null, null);
}

export const findBlock = (model: Model, id: string) => locate(model, id)?.block ?? null;

/** The blocks from the top of the document down to `id`, `id` last. */
export function pathTo(model: Model, id: string): Block[] {
  const path: Block[] = [];
  const visit = (list: Block[]): boolean => {
    for (const block of list) {
      path.push(block);
      if (block.id === id) return true;
      for (const children of Object.values(block.slots ?? {})) if (visit(children)) return true;
      path.pop();
    }
    return false;
  };
  return visit(model.blocks) ? path : [];
}

/** Every block in document order, depth first. */
export function flatten(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const visit = (list: Block[]) => {
    for (const block of list) {
      out.push(block);
      for (const children of Object.values(block.slots ?? {})) visit(children);
    }
  };
  visit(blocks);
  return out;
}

/** Whether `ancestor` contains `id` anywhere below it. */
export function contains(ancestor: Block, id: string): boolean {
  return Object.values(ancestor.slots ?? {}).some((children) => children.some((child) => child.id === id || contains(child, id)));
}

/** The ids from `from` to `to` among one list's siblings, inclusive, in order. */
export function siblingRange(list: Block[], from: string, to: string): string[] {
  const a = list.findIndex((block) => block.id === from);
  const b = list.findIndex((block) => block.id === to);
  if (a < 0 || b < 0) return [];
  const [start, end] = a <= b ? [a, b] : [b, a];
  return list.slice(start, end + 1).map((block) => block.id);
}

/** The deepest list both blocks sit in, and the two blocks (or their ancestors) in it. */
export function commonLevel(model: Model, a: string, b: string): { list: Block[]; from: string; to: string } | null {
  const pathA = pathTo(model, a);
  const pathB = pathTo(model, b);
  if (pathA.length === 0 || pathB.length === 0) return null;
  let depth = 0;
  while (depth < pathA.length - 1 && depth < pathB.length - 1 && pathA[depth].id === pathB[depth].id) depth++;
  if (pathA[depth].id === pathB[depth].id) {
    // One is an ancestor of the other: select the ancestor.
    const location = locate(model, pathA[depth].id)!;
    return { list: location.list, from: pathA[depth].id, to: pathA[depth].id };
  }
  const location = locate(model, pathA[depth].id)!;
  return { list: location.list, from: pathA[depth].id, to: pathB[depth].id };
}
