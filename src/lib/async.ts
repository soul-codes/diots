import { flow } from "fp-ts/lib/function.js";
import * as t from "fp-ts/lib/Task.js";
import { DecoderStructType, TaskDecoder, TaskDecoderW } from "./types.js";

export const async = <A>(decoder: TaskDecoderW<A>): TaskDecoder<A> =>
  decoder.async
    ? decoder
    : { async: true, decode: flow(decoder.decode, t.of), meta: decoder.meta };

export const defer = <A>(decoder: Promise<TaskDecoderW<A>>): TaskDecoder<A> => {
  return {
    async: true,
    decode: (value) => async () => {
      const result = (await decoder).decode(value);
      return typeof result === "function" ? result() : result;
    },
    meta: {
      struct: {
        type: DecoderStructType.Deferred,
        deferred: decoder.then((decoder) => decoder.meta),
      },
      alias: null,
      doc: null,
    },
  };
};
