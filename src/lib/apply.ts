import { pipe } from "fp-ts/lib/function.js";
import * as rr from "fp-ts/lib/ReadonlyRecord.js";
import { async } from "./async.js";
import { Decoder, TaskDecoder, TaskDecoderW } from "./types.js";

export type ApplyDecoder<
  TF extends TypeFunction,
  T extends TaskDecoderW<any>
> = T extends TaskDecoder<infer A>
  ? TaskDecoder<Apply<TF, A>>
  : T extends Decoder<infer A>
  ? Decoder<Apply<TF, A>>
  : never;

export type ApplyTaskDecoder<
  TF extends TypeFunction,
  T extends TaskDecoderW<any>
> = T extends TaskDecoderW<infer A> ? TaskDecoder<Apply<TF, A>> : never;

export type ApplyDecoderTuple<
  TF extends TypeFunction,
  T extends readonly TaskDecoderW<any>[]
> = T extends readonly Decoder<any>[]
  ? Decoder<
      Apply<
        TF,
        {
          [key in keyof T]: T[key] extends TaskDecoderW<infer A> ? A : never;
        }
      >
    >
  : TaskDecoder<
      Apply<
        TF,
        {
          [key in keyof T]: T[key] extends TaskDecoderW<infer A> ? A : never;
        }
      >
    >;

export type ApplyDecoderStruct<
  TF extends TypeFunction,
  TConstraint,
  TDecoders
> = TDecoders[keyof TDecoders] extends Decoder<any>
  ? Decoder<Apply<TF, ApplyDecoderStructDecoders<TDecoders, TConstraint>>>
  : TaskDecoder<Apply<TF, ApplyDecoderStructDecoders<TDecoders, TConstraint>>>;

type ApplyDecoderStructDecoders<TDecoders, TConstraint> = {
  [key in keyof TDecoders]: TDecoders[key] extends TaskDecoderW<infer A>
    ? A
    : never;
} extends infer U
  ? TConstraint extends U
    ? TConstraint
    : U
  : never;

export type DecoderCombinator<TF extends TypeFunction> = <
  T extends TaskDecoderW<any>
>(
  m: T
) => ApplyDecoder<TF, T>;

export type TaksDecoderCombinator<TF extends TypeFunction> = <
  T extends TaskDecoderW<any>
>(
  m: T
) => ApplyTaskDecoder<TF, T>;

export type DecoderTupleCombinator<TF extends TypeFunction> = <
  T extends readonly TaskDecoderW<any>[]
>(
  ...m: T
) => ApplyDecoderTuple<TF, T>;

export type DecoderStructCombinator<TF extends TypeFunction, T> = <
  U extends { [key in keyof T]: TaskDecoderW<T[key]> }
>(
  ms: U
) => ApplyDecoderStruct<TF, T, U>;

export const fn1 = <TF extends TypeFunction>(
  s: <T>(m: Decoder<T>) => Decoder<Apply<TF, T>>,
  a: <T>(m: TaskDecoder<T>) => TaskDecoder<Apply<TF, T>>
) =>
  ((m: TaskDecoderW<any>) => (m.async ? a(m) : s(m))) as DecoderCombinator<TF>;

export const combine = <TF extends TypeFunction>(
  s: <T>(m: Decoder<T>) => TaskDecoder<Apply<TF, T>>,
  a: <T>(m: TaskDecoder<T>) => TaskDecoder<Apply<TF, T>>
) =>
  ((m: TaskDecoderW<any>) =>
    m.async ? a(m) : s(m)) as TaksDecoderCombinator<TF>;

export const comineT = <TF extends TypeFunction>(
  s: <T>(m: readonly Decoder<T>[]) => Decoder<Apply<TF, T[]>>,
  a: <T>(m: readonly TaskDecoder<T>[]) => TaskDecoder<Apply<TF, T[]>>
) =>
  ((...m: readonly TaskDecoderW<any>[]) =>
    m.some((m) => m.async)
      ? a(m.map(async))
      : s(m as readonly Decoder<any>[])) as DecoderTupleCombinator<TF>;

export const combineS = <TF extends TypeFunction>(
  s: <T>(
    m: rr.ReadonlyRecord<string, Decoder<T>>
  ) => Decoder<Apply<TF, rr.ReadonlyRecord<string, T>>>,
  a: <T>(
    m: rr.ReadonlyRecord<string, TaskDecoder<T>>
  ) => TaskDecoder<Apply<TF, rr.ReadonlyRecord<string, T>>>
) => {
  const factory = (m: rr.ReadonlyRecord<string, TaskDecoderW<any>>) =>
    pipe(
      m,
      rr.some((m) => m.async === true)
    )
      ? a(pipe(m, rr.map(async)) as rr.ReadonlyRecord<string, TaskDecoder<any>>)
      : s(m as rr.ReadonlyRecord<string, Decoder<any>>);

  return <T>() => factory as DecoderStructCombinator<TF, T>;
};

export interface TypeFunction {
  in: unknown;
  out: unknown;
}

export type Apply<TF extends TypeFunction, In extends TF["in"]> = (TF & {
  in: In;
})["out"];
