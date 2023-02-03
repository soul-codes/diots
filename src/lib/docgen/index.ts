import { AliasInstance, DecoderMeta, DecoderStructType } from "../index.js";

import { flow, pipe } from "fp-ts/lib/function.js";
import * as rr from "fp-ts/lib/ReadonlyRecord.js";
import * as t from "fp-ts/lib/Task.js";
import { block, code, d, kb, KBInstance, list, Node, NodeType } from "kbts";
import { DocTree } from "../DocTree.js";

export function docgen() {
  const aliasKbs = new Map<AliasInstance, Promise<KBInstance>>();

  const gen = (meta: DecoderMeta): Promise<KBInstance | Node> => {
    const alias = meta.alias;
    if (alias) {
      let promiseKb = aliasKbs.get(alias);
      if (!promiseKb) {
        promiseKb = createDocNodeFromMeta(meta).then(kb(alias.name));
        aliasKbs.set(alias, promiseKb);
      }
      return promiseKb;
    }

    return createDocNodeFromMeta(meta);
  };

  function recurse(meta: DecoderMeta): Promise<Node> {
    return gen(meta).then((value) =>
      typeof value === "object" && value?.type === NodeType.KB
        ? value.embed((link) => link(), null)
        : value
    );
  }

  const createDocNodeFromMeta = async (meta: DecoderMeta): Promise<Node> => {
    const struct = meta.struct;
    switch (struct.type) {
      case DecoderStructType.Atomic: {
        return collapseDoc(meta.doc);
      }

      case DecoderStructType.Literal: {
        return d(
          block(null)`The literal ${code(JSON.stringify(struct.value))}`,
          collapseDoc(meta.doc)
        );
      }

      case DecoderStructType.Array: {
        return d(
          block(null)`An array. ${list([
            d`Element: ${await recurse(struct.item)}`,
          ])}`,
          collapseDoc(meta.doc)
        );
      }

      case DecoderStructType.Dictionary: {
        return d(
          block(null)`A dictionary. ${list([
            d`Key: ${await recurse(struct.key)}`,
            d`Value: ${await recurse(struct.value)}`,
          ])}`,
          collapseDoc(meta.doc)
        );
      }

      case DecoderStructType.Struct: {
        return pipe(
          struct.members,
          rr.map(
            (field) => () => gen(field.meta).then((doc) => ({ field, doc }))
          ),
          rr.sequence(t.task),
          t.map(
            flow(
              rr.mapWithIndex(
                (key, { field, doc }) =>
                  d`
              ${field.required ? "(required)" : "(optional)"}
              ${code(key)}: ${doc}
              `
              ),
              (fields) => Object.values(fields),
              (fields) =>
                d(
                  block(null)`A key-value structure. ${list(fields)}`,
                  collapseDoc(meta.doc)
                )
            )
          )
        )();
      }

      case DecoderStructType.Union: {
        const members = await Promise.all(struct.members.map(recurse));
        return d(
          block(null)`One of the following. ${list(members)}`,
          collapseDoc(meta.doc)
        );
      }

      case DecoderStructType.Intersection: {
        const members = await Promise.all(struct.members.map(recurse));
        return d(
          block(null)`All of the following. ${list(members)}`,
          collapseDoc(meta.doc)
        );
      }

      case DecoderStructType.Parser: {
        return d(
          await recurse(struct.upstream),
          collapseDoc(meta.doc),
          collapseDoc(struct.parserDoc)
        );
      }

      case DecoderStructType.Deferred: {
        return d(await recurse(await struct.deferred), collapseDoc(meta.doc));
      }
    }
  };
}

function collapseDoc(doc: DocTree): Node {
  if (!doc) return null;
  if (Array.isArray(doc)) {
    return d(doc.map((doc) => block(null)(collapseDoc(doc))));
  }
  return d(doc.content, collapseDoc(doc.details));
}
