# diots - document-preserving decoders

`diots` (for "**d**ocumented `io-ts`" ) augments
[io-ts](https://www.npmjs.com/package/io-ts "io-ts") decoders. It provides a parallel set of decoder factory functions
(such as `string`, `struct`, etc), with the main difference
that `diots` decoders also preserve structural metadata that can be inspected
through the `meta` property. Additionally, the decoders can be
documented with the documentation tagger `doc`, which lets you write
documentation using [kbts](https://www.npmjs.com/package/kbts "kbts"), "kbts").

The `diots` decoders are compatible with/can substitute for native
[io-ts](https://www.npmjs.com/package/io-ts "io-ts") decoders, and the latter can be lifted into the `diots` realm
using the `atomic` function.

It provides the `docgen` module, which inspects decoder's structural
metadata fields and generate kbts documentation.
