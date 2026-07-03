# MTA Wiki Documentation

This directory is the durable, user-facing documentation surface for the public repository.
It explains what the project is, what data is published, how the pipeline is organized, and how
to work with the released artifacts.

Historical execution plans, temporary handoffs, campaign notes, baseline dumps, and one-off
status files are intentionally not published here. Local planning material lives under `plans/`
and is excluded from Git in this working copy.

## Documents

- [Project charter](immutable-mta-llm-wiki-spec.md): stable north-star spec for the filesystem-first
  LLM wiki.
- [Product spec](mta-llm-wiki-spec.md): current public-facing contract for the repository data
  product.
- [Architecture](architecture.md): source prep, ingest, materialization, writer regions, and query
  surfaces.
- [Data model](data-model.md): canonical record kinds, evidence, identity, ontology, and release
  artifacts.
- [Operations](operations.md): setup, common commands, validation gates, and local-only inputs.
- [Releases and provenance](releases-and-provenance.md): v1 release state, licensing, tracked data,
  ignored build artifacts, and publication notes.
