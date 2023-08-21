import type { Decoder as IotsDecoder } from "io-ts/Decoder";
import { TaskDecoder as IotsTaskDecoder } from "io-ts/TaskDecoder";

import { TypeOf as IotsTypeOfSync } from "io-ts/Decoder";
import { TypeOf as IotsTypeOfAsync } from "io-ts/TaskDecoder";
import { DocTree } from "./DocTree.js";

export enum DecoderStructType {
  Literal,
  Atomic,
  Struct,
  Array,
  Dictionary,
  Union,
  Intersection,
  Parser,
  Deferred,
  Lazy,
}

export interface AliasInstance {
  _uniqueId: number;
  name: string;
  collapsible: boolean;
}

export type DecoderMeta = {
  alias: AliasInstance | null;
  struct: DecoderStruct;
  doc: DocTree;
};

export interface DecoderStruct_Literal {
  type: DecoderStructType.Literal;
  value: string | number | boolean | bigint;
}

export interface DecoderStruct_Atomic {
  type: DecoderStructType.Atomic;
  alias: AliasInstance;
}

export interface DecoderStruct_Array {
  type: DecoderStructType.Array;
  item: DecoderMeta;
}

export interface DecoderStruct_Dictionary {
  type: DecoderStructType.Dictionary;
  key: DecoderMeta;
  value: DecoderMeta;
}

export interface DecoderStruct_Struct {
  type: DecoderStructType.Struct;
  members: Readonly<Record<string, DecoderStruct_StructField>>;
}

export interface DecoderStruct_StructField {
  required: boolean;
  meta: DecoderMeta;
}

export interface DecoderStruct_Intersection {
  type: DecoderStructType.Intersection;
  members: readonly DecoderMeta[];
}

export interface DecoderStruct_Union {
  type: DecoderStructType.Union;
  members: readonly DecoderMeta[];
}

export interface DecoderStruct_Parser {
  type: DecoderStructType.Parser;
  upstream: DecoderMeta;
  parserDoc: DocTree;
}

export interface DecoderStruct_Deferred {
  type: DecoderStructType.Deferred;
  deferred: Promise<DecoderMeta>;
}

export interface DecoderStruct_Lazy {
  type: DecoderStructType.Lazy;
  target: DecoderMeta;
}

export type DecoderStruct =
  | DecoderStruct_Literal
  | DecoderStruct_Atomic
  | DecoderStruct_Array
  | DecoderStruct_Dictionary
  | DecoderStruct_Struct
  | DecoderStruct_Intersection
  | DecoderStruct_Union
  | DecoderStruct_Parser
  | DecoderStruct_Deferred
  | DecoderStruct_Lazy;

export interface Decoder<A> extends IotsDecoder<unknown, A> {
  meta: DecoderMeta;
  async?: false | null;
}

export interface TaskDecoder<A> extends IotsTaskDecoder<unknown, A> {
  meta: DecoderMeta;
  async: true;
}

export type TaskDecoderW<A> = Decoder<A> | TaskDecoder<A>;

export type TypeOf<K> = K extends IotsDecoder<any, any>
  ? IotsTypeOfSync<K>
  : K extends IotsTaskDecoder<any, any>
  ? IotsTypeOfAsync<K>
  : never;
