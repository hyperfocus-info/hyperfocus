# Licensing model

The operative grant is the [Hyperfocus Source-Available Game License 2.0](../LICENSE). This page explains the commercial model in plain language; if it conflicts with `LICENSE`, the license controls.

## Standard terms

- The source can be viewed, studied, forked, and modified.
- A game owes no royalty on its first USD 50,000 of adjusted revenue in each calendar year.
- The royalty is **5% only on the portion above USD 50,000**. Crossing the threshold never makes the first USD 50,000 retroactively royalty-bearing.
- No report is required while a game remains at or below the annual threshold. After it crosses the threshold, reports and payments are quarterly, with a final annual statement.
- Ports, editions, DLC, expansions, renamed releases, and substantially similar releases are grouped as one game. Revenue from controlled affiliates is also aggregated.
- Adjusted revenue means money actually received from the game after refunds, chargebacks, separately stated sales taxes/VAT, and storefront or payment-processing fees. Ordinary business costs are not deductions.
- A company can negotiate alternative terms with the licensor in writing.

The calculation is:

```text
annual royalty = 0.05 × max(0, adjusted annual game revenue − 50,000 USD)
```

| Adjusted annual game revenue | Royalty |
| ---: | ---: |
| USD 25,000 | USD 0 |
| USD 50,000 | USD 0 |
| USD 50,001 | USD 0.05 |
| USD 75,000 | USD 1,250 |
| USD 150,000 | USD 5,000 |

This marginal calculation avoids a revenue cliff and makes experimentation, hobby projects, free games, and small commercial releases practical.

## Games are not engine forks

A commercial game can remain closed source. The license does not require disclosure of proprietary gameplay code, engine changes used only inside the game, art, audio, story, data, or other independently authored content.

The engine itself and engine forks may be redistributed only at no charge, with corresponding source, notices, and the same license. They may not be sold, rented, paywalled, bundled behind a required purchase, or offered as a monetized engine service without a separate written agreement. Bona fide consulting, training, support, hosting, and game-development work remain allowed when the engine itself stays freely accessible and the service fee is not a disguised engine license.

Independent plugins, tools, libraries, and content can be commercial when they interoperate with Hyperfocus without copying engine code.

## Exit and portability

Project ownership does not depend on remaining a Hyperfocus customer. Game content can be recovered through the documented JSON, ZIP, glTF, RGBA, WAV, SHA-256, and neutral-export contracts and migrated at any time. If a release is fully moved off Hyperfocus and contains no engine code, revenue received from that migrated release afterward is outside the royalty calculation. Revenue for older releases that still contain Hyperfocus remains covered, and already accrued royalties remain due.

The canonical editor project stays limited to two files:

```text
.hyperfocus/project.json
.hyperfocus/assets.hfp
```

`project.json` is public, deterministic JSON. `assets.hfp` is a deterministic standard ZIP with verified content-addressed objects, despite its product-specific extension. The shared neutral exporter produces ordinary named assets plus a deterministic manifest without requiring the editor or a hosted service.

## Legal and operational note

This is a custom source-available license, not an OSI-approved open-source license. The repository owner should publish a private royalty-reporting contact and payment instructions before accepting payments. A qualified lawyer should review the license for the licensor's jurisdiction and business structure before a public commercial launch, especially its revenue definition, tax treatment, audit language, limitation of liability, and enforcement mechanics.
