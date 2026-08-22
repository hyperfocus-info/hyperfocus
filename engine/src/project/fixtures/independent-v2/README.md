# Independent v2 fixture

`project.json` is canonical editor project JSON. `assets.hfp.base64` is a text-safe repository representation of the exact `assets.hfp` ZIP bytes; base64 decoding it produces the canonical second file.

The fixture contains one object whose uncompressed bytes are `portable fixture asset\n`. Its SHA-256 is `443daf148d39bebb135ccf2d0cc8d24b9c1e2500f2dc054f6d71c9f83eae1882`.

The independent-reader test deliberately imports no Hyperfocus project codec. It parses JSON, walks standard ZIP local and central records, extracts the object, and verifies the digest with the platform SHA-256 implementation.
