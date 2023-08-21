import * as rr from "fp-ts/lib/ReadonlyRecord.js";
import * as t from "fp-ts/lib/Task.js";
import { flow, pipe } from "fp-ts/lib/function.js";
import { KBInstance, Node, NodeType, block, code, d, kb, list } from "kbts";
import { DocTree } from "../DocTree.js";
import {
  any,
  boolean,
  ignored,
  nullStrict,
  nullish,
  number,
  object,
  string,
  undefinedish,
  unknown,
} from "../factories.js";
import {
  AliasInstance,
  Decoder,
  DecoderMeta,
  DecoderStructType,
  TaskDecoderW,
} from "../types.js";

export interface DocGenerator {
  generate: (
    meta: DecoderMeta | TaskDecoderW<any>
  ) => Promise<KBInstance | Node>;
}

export interface DocGenOptions {
  /**
   * Specifies decoders whose documentation should simply be inlined instead of
   * referenced as a linked KB when there are many references.
   *
   * This works by decoder alias instances: all decoders whose aliases are
   * included will have their inline predicate figured out from here.
   * By default, built-in atomic decoders are always inlined.
   */
  inlineDecoders: Iterable<readonly [Decoder<any> | AliasInstance, boolean]>;
}

export function docgen(options?: Partial<DocGenOptions>) {
  const aliasCache = new Map<AliasInstance, Promise<KBInstance | Node>>();
  const inlineDecoders = new Map(
    [
      ...[
        string,
        number,
        boolean,
        nullStrict,
        nullish,
        undefinedish,
        unknown,
        object,
        any,
        ignored,
      ].map((decoder) => [decoder, true] as const),
      ...(options?.inlineDecoders || []),
    ]
      .map(([decoderOrAliases, predicate]) =>
        "decode" in decoderOrAliases
          ? decoderOrAliases.meta.alias
            ? ([decoderOrAliases.meta.alias, predicate] as const)
            : (null as never)
          : ([decoderOrAliases, predicate] as const)
      )
      .filter(Boolean)
  );

  return {
    generate: gen,
  };

  function gen(
    decoderOrMeta: DecoderMeta | TaskDecoderW<any>
  ): Promise<KBInstance | Node> {
    const meta = "decode" in decoderOrMeta ? decoderOrMeta.meta : decoderOrMeta;
    const alias = meta.alias;
    if (alias) {
      let promiseKb = aliasCache.get(alias);
      if (!promiseKb) {
        promiseKb = createDocNodeFromMeta(meta).then(
          (node): KBInstance | Node => {
            const shouldInline = meta.alias
              ? inlineDecoders.get(meta.alias) ?? false
              : false;
            return shouldInline ? node : kb(alias.name)(node);
          }
        );
        aliasCache.set(alias, promiseKb);
      }
      return promiseKb;
    }

    return createDocNodeFromMeta(meta);
  }

  function recurse(meta: DecoderMeta): Promise<Node> {
    return gen(meta).then((value) => {
      if (typeof value === "object" && value?.type === NodeType.KB) {
        return value.embed((link) => link(), null);
      } else {
        return value;
      }
    });
  }

  async function createDocNodeFromMeta(meta: DecoderMeta): Promise<Node> {
    const struct = meta.struct;
    switch (struct.type) {
      case DecoderStructType.Atomic: {
        return d(defaultAtomicDocs(struct.alias), collapseDoc(meta.doc));
      }

      case DecoderStructType.Literal: {
        return d(
          block(null)`The literal ${code(JSON.stringify(struct.value))}`,
          collapseDoc(meta.doc)
        );
      }

      case DecoderStructType.Array: {
        return d(
          block(null)`An array. ${list(
            d`Element: ${await recurse(struct.item)}`
          )}`,
          collapseDoc(meta.doc)
        );
      }

      case DecoderStructType.Dictionary: {
        return d(
          block(null)`A dictionary. ${list(
            d`Key: ${await recurse(struct.key)}`,
            d`Value: ${await recurse(struct.value)}`
          )}`,
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
                (key, { field, doc }) => d`
              ${field.required ? "(required)" : "(optional)"}
              ${code(key)}: ${doc}
              `
              ),
              (fields) => Object.values(fields),
              (fields) =>
                d(
                  block(null)`A key-value structure. ${list(...fields)}`,
                  collapseDoc(meta.doc)
                )
            )
          )
        )();
      }

      case DecoderStructType.Union: {
        const members = await Promise.all(struct.members.map(recurse));
        return d(
          block(null)`One of the following. ${list(...members)}`,
          collapseDoc(meta.doc)
        );
      }

      case DecoderStructType.Intersection: {
        const members = await Promise.all(struct.members.map(recurse));
        return d(
          block(null)`All of the following. ${list(...members)}`,
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

      case DecoderStructType.Lazy: {
        return d(await recurse(struct.target), collapseDoc(meta.doc));
      }
    }
  }
}

function collapseDoc(doc: DocTree): Node {
  if (!doc) return null;
  if (Array.isArray(doc)) {
    return d(doc.map((doc) => block(null)(collapseDoc(doc))));
  }
  return d(doc.content, collapseDoc(doc.details));
}

export function defaultAtomicDocs(alias: AliasInstance): Node {
  switch (alias) {
    case string.meta.alias: {
      return "A string value.";
    }
    case boolean.meta.alias: {
      return "A boolean value.";
    }
    case number.meta.alias: {
      return "A numeric value.";
    }
    case nullStrict.meta.alias: {
      return d`The value ${code("null")}.`;
    }
    case nullish.meta.alias:
    case undefinedish.meta.alias: {
      return "A nullish (null or undefined) value.";
    }

    case object.meta.alias: {
      return "An object value.";
    }

    case any.meta.alias:
    case unknown.meta.alias: {
      return "A value of any type.";
    }

    case ignored.meta.alias: {
      return "This value does not need to be provided and is ignored.";
    }

    default: {
      return null;
    }
  }
}
