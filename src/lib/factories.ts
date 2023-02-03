import { Node } from "kbts";
import { DocTree } from "./DocTree.js";

import * as e from "fp-ts/lib/Either.js";
import { flow, pipe } from "fp-ts/lib/function.js";
import * as ra from "fp-ts/lib/ReadonlyArray.js";
import * as rr from "fp-ts/lib/ReadonlyRecord.js";
import * as t from "fp-ts/lib/Task.js";
import * as te from "fp-ts/lib/TaskEither.js";
import { Decoder as IotsDecoder } from "io-ts/lib/Decoder.js";

import { key as keyDecodeError, required } from "io-ts/lib/DecodeError.js";
import {
  array as iotsSyncArray,
  boolean as iotsBoolean,
  DecodeError,
  failure,
  intersect as iotsIntersect,
  number as iotsNumber,
  partial as iotsSyncPartial,
  record as iotsSyncRecord,
  string as iotsString,
  struct as iotsSyncStruct,
  success,
  union as iotsSyncUnion,
} from "io-ts/lib/Decoder.js";
import { concat, of as fsgOf } from "io-ts/lib/FreeSemigroup.js";
import {
  array as iotsAsyncArray,
  intersect as iotsAsyncIntersect,
  partial as iotsAsyncPartial,
  record as iotsAsyncRecord,
  struct as iotsAsyncStruct,
  union as iotsAsyncUnion,
} from "io-ts/lib/TaskDecoder.js";

import { combineS, comineT, fn1, TypeFunction } from "./apply.js";
import {
  AliasInstance,
  Decoder,
  DecoderMeta,
  DecoderStructType,
  TaskDecoder,
  TaskDecoderW,
  TypeOf,
} from "./types.js";
import { async } from "./async.js";

/**
 * Creates an alias instance.
 */
export const alias = (() => {
  let counter = 0;

  /**
   * @param collapsible
   *   If true, the alias may be "collapsed" when in a composition with other
   *   decoders where simplification can occur. This includes:
   *   - Intersection of structures and partials.
   *   - Intersection of intersections
   *   - Union of unions
   */
  return (name: string, collapsible: boolean = false): AliasInstance => ({
    _uniqueId: ++counter,
    name,
    collapsible,
  });
})();

interface IdentityTF {
  in: unknown;
  out: this["in"];
}

/**
 * Add or override documentation to to a decoder to produce a documented
 * decoder.
 * @param documentation
 * @param options
 * @returns
 */
export const doc = (documentation: Node, alias?: AliasInstance | null) => {
  const meta = docMeta(documentation, alias);
  return fn1<IdentityTF>(
    (doc) => ({ ...doc, meta: meta(doc) }),
    (doc) => ({ ...doc, meta: meta(doc) })
  );
};

const docMeta =
  (documentation: Node, alias: AliasInstance | null | undefined) =>
  (decoder: TaskDecoderW<any>): DecoderMeta => {
    return decoder.meta.struct.type === DecoderStructType.Atomic
      ? {
          struct: {
            type: DecoderStructType.Atomic,
            alias: alias ?? decoder.meta.struct.alias,
          },
          doc: { content: documentation, details: decoder.meta.doc },
          alias: alias ?? decoder.meta.alias,
        }
      : {
          struct: decoder.meta.struct,
          doc: { content: documentation, details: decoder.meta.doc },
          alias: alias ?? null,
        };
  };

export const atomic = <A>(
  decoder: IotsDecoder<unknown, A> | IotsDecoder<unknown, A>["decode"],
  alias: AliasInstance
): Decoder<A> => {
  const decode = typeof decoder === "function" ? decoder : decoder.decode;
  return {
    decode: (value) =>
      pipe(
        value,
        decode,
        e.fold(() => failure(value, alias.name), success)
      ),
    meta: {
      struct: { type: DecoderStructType.Atomic, alias },
      alias,
      doc: null,
    },
  };
};

export const string: Decoder<string> = atomic(iotsString, alias("string"));

export const number: Decoder<number> = atomic(iotsNumber, alias("number"));

export const boolean: Decoder<boolean> = atomic(iotsBoolean, alias("boolean"));

export const nullStrict: Decoder<null> = atomic(
  (value: unknown) => (value === null ? success(null) : failure(value, "null")),
  alias("null")
);

export const nullish: Decoder<null> = atomic(
  (value) => (value == null ? success(null) : failure(value, "nullish")),
  alias("nullish")
);

export const undefinedish: Decoder<undefined> = atomic(
  (value: unknown) =>
    value == null ? success(void 0) : failure(value, "undefinedish"),
  alias("undefinedish")
);

export const unknown: Decoder<unknown> = atomic(success, alias("any"));
export const any: Decoder<any> = unknown;
export const ignored: Decoder<void> = atomic(
  () => success(void 0),
  alias("ignored")
);

export const object: Decoder<object> = atomic(
  (value) =>
    typeof value === "object" && value
      ? success(value)
      : failure(value, "object"),
  alias("object")
);

export const instance = (() => {
  const aliases = new WeakMap<object, AliasInstance>();
  const ensureAlias = (Constructor: {
    new (...args: any): any;
    name: string;
  }) => {
    if (aliases.has(Constructor)) return aliases.get(Constructor)!;
    const a = alias(Constructor.name);
    aliases.set(Constructor, a);
    return a;
  };

  return <T extends { new (...args: any): any; name: string }>(
    Constructor: T
  ): Decoder<T extends { new (...args: any): infer T } ? T : never> => {
    return atomic(
      (value) =>
        value instanceof Constructor
          ? success(value)
          : failure(value, Constructor.name),
      ensureAlias(Constructor)
    );
  };
})();

export type LiteralValue = string | number | boolean | bigint;

export const literal = <A extends LiteralValue>(value: A): Decoder<A> => {
  const constantSuccess = success(value);
  const message = "Exactly " + JSON.stringify(value);
  return {
    decode: (test: unknown) =>
      test === value ? constantSuccess : failure(test, message),
    meta: {
      struct: { type: DecoderStructType.Literal, value },
      alias: null,
      doc: null,
    },
  };
};

interface ArrayTF extends TypeFunction {
  out: readonly this["in"][];
}

export const array = fn1<ArrayTF>(
  (m) => ({
    decode: iotsSyncArray(m).decode,
    meta: arrayMeta(m),
  }),
  (m) => ({
    async: true,
    decode: iotsAsyncArray(m).decode,
    meta: arrayMeta(m),
  })
);

function arrayMeta(m: TaskDecoderW<any>): DecoderMeta {
  return {
    struct: { type: DecoderStructType.Array, item: m.meta },
    alias: null,
    doc: null,
  };
}

interface RecordTF<K extends string> extends TypeFunction {
  out: rr.ReadonlyRecord<K, this["in"]>;
}

export const record = fn1<RecordTF<string>>(
  (m) => ({
    decode: iotsSyncRecord(m).decode,
    meta: recordMeta(string, m),
  }),
  (m) => ({
    async: true,
    decode: iotsAsyncRecord(m).decode,
    meta: recordMeta(string, m),
  })
);

export const recordK = <K extends string>(key: Decoder<K>) =>
  fn1<PartialRecordTF<K>>(
    (m) => ({
      decode: flow(iotsSyncRecord(m).decode, e.chain(recordKeyRefinement(key))),
      meta: recordMeta(key, m),
    }),
    (m) => ({
      async: true,
      decode: flow(
        iotsAsyncRecord(m).decode,
        te.chainEitherK(recordKeyRefinement(key))
      ),
      meta: recordMeta(key, m),
    })
  );

interface PartialRecordTF<K extends string> extends TypeFunction {
  out: Partial<rr.ReadonlyRecord<K, this["in"] | undefined>>;
}

function recordMeta<A, K extends string>(
  _key: Decoder<K>,
  value: TaskDecoderW<A>
): DecoderMeta {
  return {
    struct: {
      type: DecoderStructType.Dictionary,
      key: _key.meta,
      value: value.meta,
    },
    doc: null,
    alias: null,
  };
}

function recordKeyRefinement<K extends string>(_key: Decoder<K>) {
  return <A>(record: rr.ReadonlyRecord<string, A>) => {
    const { left: errors } = pipe(
      Object.keys(record),
      ra.partitionMap((k) =>
        pipe(
          _key.decode(k),
          e.mapLeft((decodeError) =>
            fsgOf(keyDecodeError(k, required, decodeError))
          )
        )
      )
    );

    if (errors.length == 0) {
      return success(record as rr.ReadonlyRecord<K, A>);
    }

    const [firstError, ...remainingErrors] = errors;
    return e.left(pipe(remainingErrors, ra.reduce(firstError, concat)));
  };
}

const _struct = combineS<IdentityTF>(
  (fields) => ({
    decode: iotsSyncStruct(fields).decode,
    meta: structMeta(fields),
  }),
  (fields) => ({
    async: true,
    decode: iotsAsyncStruct(
      pipe(
        fields as rr.ReadonlyRecord<string, TaskDecoderW<unknown>>,
        rr.map(async),
        (fields) => fields
      )
    ).decode as any,
    meta: structMeta(fields),
  })
);

export const struct = _struct<unknown>();

export const structT = <T>() => _struct<T>();

function structMeta<T>(fields: {
  [key in keyof T]: TaskDecoderW<T[key]>;
}): DecoderMeta {
  return {
    struct: {
      type: DecoderStructType.Struct,
      members: pipe(
        fields as rr.ReadonlyRecord<string, Decoder<unknown>>,
        rr.map((field) => ({ meta: field.meta, required: true }))
      ),
    },
    alias: null,
    doc: null,
  };
}

interface PartialTF {
  in: unknown;
  out: Partial<this["in"]>;
}

const _partial = combineS<PartialTF>(
  (fields) => ({
    decode: iotsSyncPartial(fields).decode,
    meta: partialMeta(fields),
  }),
  (fields) => ({
    async: true,
    decode: iotsAsyncPartial(
      pipe(
        fields as rr.ReadonlyRecord<string, TaskDecoderW<unknown>>,
        rr.map(async),
        (fields) => fields
      )
    ).decode as any,
    meta: partialMeta(fields),
  })
);

export const partial = _partial<unknown>();

export const partialT = <T>() => _partial<T>();

function partialMeta<T>(fields: {
  [key in keyof T]: TaskDecoderW<T[key]>;
}): DecoderMeta {
  return {
    struct: {
      type: DecoderStructType.Struct,
      members: pipe(
        fields as rr.ReadonlyRecord<string, Decoder<unknown>>,
        rr.map((field) => ({ meta: field.meta, required: false }))
      ),
    },
    alias: null,
    doc: null,
  };
}

interface OptionalStructTF {
  in: unknown;
  out: this["in"] | { [key in keyof this["in"]]?: undefined };
}

const _optionalStruct = combineS<OptionalStructTF>(
  (fields) => ({
    decode: union(
      struct(fields),
      partial(
        pipe(
          fields,
          rr.map(() => undefinedish)
        )
      )
    ).decode,
    meta: optionalStructMeta(fields),
  }),
  (fields) => ({
    async: true,
    decode: union(
      struct(pipe(fields, rr.map(async))),
      partial(
        pipe(
          fields,
          rr.map(() => undefinedish)
        )
      )
    ).decode,
    meta: optionalStructMeta(fields),
  })
);

export const optionalStruct = _optionalStruct<unknown>();

export const optionalStructT = <T>() => _optionalStruct<T>();

function optionalStructMeta<T>(fields: {
  [key in keyof T]: TaskDecoderW<T[key]>;
}): DecoderMeta {
  return {
    struct: {
      type: DecoderStructType.Struct,
      members: pipe(
        fields as rr.ReadonlyRecord<string, Decoder<unknown>>,
        rr.map((field) => ({ meta: field.meta, required: false }))
      ),
    },
    alias: null,
    doc: null,
  };
}

export type IntersectionOf<
  U extends TaskDecoderW<any>,
  T extends TaskDecoderW<any>
> = U extends TaskDecoder<infer B>
  ? TaskDecoder<B & TypeOf<T>>
  : U extends Decoder<infer B>
  ? T extends TaskDecoder<infer A>
    ? TaskDecoder<A & B>
    : T extends Decoder<infer A>
    ? Decoder<A & B>
    : never
  : never;

export function intersect<U extends TaskDecoderW<any>>(
  right: U
): {
  <T extends TaskDecoderW<any>>(left: T): IntersectionOf<U, T>;
};
export function intersect<B>(
  right: TaskDecoderW<B>
): <A>(left: any) => TaskDecoderW<A & B> {
  return <A>(left: TaskDecoderW<A>) => {
    const meta: DecoderMeta = {
      struct: {
        type: DecoderStructType.Intersection,
        members: [left.meta, right.meta],
      },
      doc: null,
      alias: null,
    };
    return right.async || left.async
      ? {
          async: true,
          decode: iotsAsyncIntersect(async(right))(async(left)).decode,
          meta,
        }
      : { decode: iotsIntersect(right)(left).decode, meta };
  };
}

interface UnionTF {
  in: unknown;
  out: this["in"] extends readonly (infer A)[] ? A : never;
}

export const union = comineT<UnionTF>(
  (ms) => ({
    decode: iotsSyncUnion(...(ms as any)).decode as any,
    meta: unionMeta(ms),
  }),
  (ms) => ({
    async: true,
    decode: iotsAsyncUnion(...(ms as any)).decode as any,
    meta: unionMeta(ms),
  })
);

const unionMeta = (ms: readonly TaskDecoderW<any>[]): DecoderMeta => ({
  struct: {
    type: DecoderStructType.Union,
    members: ms.map((member) => member.meta),
  },
  doc: null,
  alias: null,
});

export interface Parser<A, B> {
  async?: false;
  parse: (a: A) => e.Either<DecodeError, B>;
  doc: DocTree;
  upstream?: Parser<any, any>;
}

export interface ParserT<A, B> {
  async: true;
  parse: (a: A) => t.Task<e.Either<DecodeError, B>>;
  doc: DocTree;
  upstream?: Parser<any, any> | ParserT<any, any>;
}

export type ParserW<A, B> =
  | Parser<A, B>
  | Parser<A, B>["parse"]
  | ([unknown] extends [A] ? Decoder<B> : never);

export type ParserTW<A, B> =
  | ParserT<A, B>
  | ParserT<A, B>["parse"]
  | ([unknown] extends [A] ? TaskDecoderW<B> : never)
  | ParserW<A, B>;

export const parser = <A, B>(
  refinement: ParserW<A, B>,
  doc: Node = null
): Parser<A, B> =>
  typeof refinement == "function"
    ? { parse: refinement, doc: { content: doc, details: null } }
    : "parse" in refinement
    ? {
        parse: refinement.parse,
        doc: { content: doc, details: refinement.doc },
      }
    : {
        parse: refinement.decode,
        doc: { content: doc, details: refinement.meta.doc },
      };

export const parserT = <A, B>(
  refinement: ParserTW<A, B>,
  doc: Node = null
): ParserT<A, B> => ({
  async: true,
  parse:
    typeof refinement == "function"
      ? (a) => async () => {
          const resultOrTask = refinement(a);
          return typeof resultOrTask === "function"
            ? resultOrTask()
            : resultOrTask;
        }
      : "parse" in refinement
      ? refinement.async
        ? refinement.parse
        : flow(refinement.parse, t.of)
      : refinement.async
      ? refinement.decode
      : flow(refinement.decode, t.of),
  doc: {
    content: doc,
    details:
      "parse" in refinement
        ? refinement.doc
        : "decode" in refinement
        ? refinement.meta.doc
        : null,
  },
});

export const parse = <A, B>(f: ParserW<A, B>) => {
  const _f = parser(f);
  function parse(decoder: TaskDecoder<A>): TaskDecoder<B>;
  function parse(decoder: Decoder<A>): Decoder<B>;
  function parse(decoder: TaskDecoderW<A>): TaskDecoderW<B> {
    const meta: DecoderMeta = {
      struct: {
        type: DecoderStructType.Parser,
        upstream: decoder.meta,
        parserDoc: _f.doc,
      },
      doc: null,
      alias: null,
    };
    return decoder.async
      ? {
          async: true,
          decode: flow(decoder.decode, t.map(e.chain(_f.parse))),
          meta: meta,
        }
      : {
          decode: flow(decoder.decode, e.chain(_f.parse)),
          meta: meta,
        };
  }
  return parse;
};

export const parseT = <A, B>(f: ParserTW<A, B>) => {
  const _f = parserT(f);
  function parse(decoder: TaskDecoderW<A>): TaskDecoder<B> {
    const meta: DecoderMeta = {
      struct: {
        type: DecoderStructType.Parser,
        upstream: decoder.meta,
        parserDoc: _f.doc,
      },
      doc: null,
      alias: null,
    };
    return {
      async: true,
      decode: decoder.async
        ? flow(decoder.decode, te.chain(_f.parse))
        : flow(decoder.decode, t.of, te.chain(_f.parse)),
      meta: meta,
    };
  }
  return parse;
};
