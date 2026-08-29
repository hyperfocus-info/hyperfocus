# Melody Fundamentals

Use this lane when auditing hooks, motifs, toplines, riff behavior, counterlines, phrase variation, melodic quality metrics, or "magic" feel.

## Core Model

Melody is not just notes inside a scale. Audit for:

- Motif cell: small rhythmic-pitch idea with identity.
- Contour: rise/fall shape, apex, recovery, and register arc.
- Range and tessitura: singable or instrument-native zone.
- Scale-degree gravity: stable notes, tendency tones, blue notes, altered approach notes.
- Rhythm identity: repeated rhythm can define hook more than pitch.
- Phrase structure: question/answer, antecedent/consequent, sentence presentation/continuation.
- Repetition with mutation: exact repeat, sequence, fragmentation, augmentation, diminution.
- Cadence/arrival: phrase target, pickup, turnaround, final-bar resolution.
- Rest strategy: silence as motif boundary and groove.
- Harmony contact: chord tones on strong beats, passing tones on weak beats, guide-tone targets.
- Layer role: lead hook, riff, countermelody, call-response answer, texture.

## Generator Risks

- A `motifScore` based on repetition can reward loops that repeat junk.
- Scale enforcement can erase expressive outside notes unless the prompt/intent explicitly marks chromatic, altered, blue note, or borrowed-tone use.
- Counterline checks can count melodic layers without checking contrary/oblique motion or register separation.
- Quality gates may prefer density, offbeat ratio, and bass roles over melodic memorability.
- Repair can change timing/pitch after the model created a coherent phrase.

## Audit Questions

- Does each generated lead have a first motif, repeat, variation, and phrase target?
- Does final bar resolve or merely fill duration?
- Does melody breathe, or does every track play every section because prompt requires it?
- Does genre change melodic grammar, not just instruments?
- Can the model return a compact motif plan before notes?
- Do tests catch contour collapse after `applyStyleDnaFilter`?

## Evaluation Ideas

- Motif recurrence: compare interval/rhythm n-grams across phrase starts.
- Contour coherence: track up/down/same sequence and apex placement.
- Phrase contrast: bar 1-2 idea, bar 3-4 answer, final turnaround.
- Harmonic targeting: chord-tone ratio on strong beats, non-chord tones resolving by step.
- Register separation: lead/counterline overlap budget.
- Rest budget: phrase breath instead of continuous note spray.

## Research Links

- Open Music Theory sentence form: https://openmusictheory.github.io/sentence
- Open Music Theory phrase archetypes: https://viva.pressbooks.pub/openmusictheory/chapter/phrase-archetypes-unique-forms/
- Controllable melody generation with phrase, contour, rhythm, and chord constraints: https://arxiv.org/abs/2109.00663
- Popular-music hierarchy and repetition analysis: https://arxiv.org/abs/2010.07518
